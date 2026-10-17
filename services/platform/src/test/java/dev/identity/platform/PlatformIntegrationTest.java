package dev.identity.platform;

import tools.jackson.databind.ObjectMapper;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.mongodb.MongoDBContainer;
import org.testcontainers.junit.jupiter.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class PlatformIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
    @Container static final MongoDBContainer MONGO = new MongoDBContainer("mongo:8.0");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        p.add("spring.datasource.username", POSTGRES::getUsername);
        p.add("spring.datasource.password", POSTGRES::getPassword);
        p.add("spring.mongodb.uri", MONGO::getReplicaSetUrl);
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired ProjectRepository projects;
    @Autowired AuditRepository audit;
    @BeforeEach void clear() { projects.deleteAll(); audit.deleteAll(); }

    private RequestPostProcessor identity(String subject, String... scopes) {
        return jwt().jwt(j -> j.subject(subject)).authorities(
                java.util.Arrays.stream(scopes).map(s -> new SimpleGrantedAuthority("SCOPE_" + s)).toArray(SimpleGrantedAuthority[]::new));
    }
    @Test void persistsProjectAndCorrelatedAuditAfterCommit() throws Exception {
        MvcResult created = mvc.perform(post("/api/projects").with(identity("alice", "projects:write"))
                        .header("X-Request-Id", "trace-123").contentType("application/json")
                        .content("{\"name\":\"  Interview demo  \",\"description\":\"  trace me  \"}"))
                .andExpect(status().isCreated()).andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.name").value("Interview demo")).andReturn();
        String id = mapper.readTree(created.getResponse().getContentAsString()).get("id").asText();
        assertThat(projects.count()).isEqualTo(1);
        assertThat(audit.findAll()).singleElement().satisfies(event -> {
            assertThat(event.requestId()).isEqualTo("trace-123");
            assertThat(event.resource()).isEqualTo(id);
            assertThat(event.actor()).isEqualTo("alice");
        });
        mvc.perform(get("/api/projects/" + id).with(identity("alice", "projects:read")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.description").value("trace me"));
        mvc.perform(get("/api/projects").with(identity("alice", "projects:read")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/platform/audit").with(identity("ops", "platform:read")))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].action").value("project.created"));
    }
    @Test void isolatesOwnersEvenWithSpoofedIdentityHeaders() throws Exception {
        Project project = projects.save(new Project("alice", "Private", ""));
        mvc.perform(get("/api/projects").with(identity("bob", "projects:read")).header("X-User-Id", "alice"))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(get("/api/projects/" + project.getId()).with(identity("bob", "projects:read")))
                .andExpect(status().isNotFound());
    }
    @Test void rejectsInvalidInputWithoutPersistingOrAuditing() throws Exception {
        for (String body : new String[]{"{}", "{\"name\":\" \",\"description\":\"\"}",
                "{\"name\":\"valid\",\"description\":null}", "{\"name\":\"" + "x".repeat(81) + "\",\"description\":\"\"}",
                "{\"name\":\"valid\",\"description\":\"" + "x".repeat(281) + "\"}"}) {
            mvc.perform(post("/api/projects").with(identity("alice", "projects:write"))
                    .contentType("application/json").content(body)).andExpect(status().isBadRequest());
        }
        assertThat(projects.count()).isZero();
        assertThat(audit.count()).isZero();
    }
    @Test void appliesDefenseInDepthAuthorization() throws Exception {
        mvc.perform(get("/api/projects")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/projects").with(identity("reader", "projects:read"))
                .contentType("application/json").content("{\"name\":\"x\",\"description\":\"\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/platform/audit").with(identity("reader", "projects:read")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/not-a-route").with(identity("ops", "platform:read"))).andExpect(status().isForbidden());
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }

    @Test void resourceServerIndependentlyValidatesSignedTokens() throws Exception {
        var key = new RSAKeyGenerator(2048).keyID("platform-key").generate();
        var server = HttpServer.create(new java.net.InetSocketAddress(0), 0);
        server.createContext("/jwks", exchange -> {
            byte[] body = new JWKSet(key.toPublicJWK()).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            JwtDecoder realDecoder = new SecurityConfig().decoder("https://issuer.test",
                    "http://localhost:" + server.getAddress().getPort() + "/jwks");
            var encoder = new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(key)));
            var header = JwsHeader.with(SignatureAlgorithm.RS256).keyId("platform-key").build();
            for (String audience : new String[]{"identity-api", "wrong-api"}) {
                var claims = JwtClaimsSet.builder().subject("alice").issuer("https://issuer.test")
                        .audience(java.util.List.of(audience)).issuedAt(java.time.Instant.now())
                        .expiresAt(java.time.Instant.now().plusSeconds(60)).build();
                String signed = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
                if (audience.equals("identity-api"))
                    assertThat(realDecoder.decode(signed).getSubject()).isEqualTo("alice");
                else
                    assertThatThrownBy(() -> realDecoder.decode(signed)).isInstanceOf(JwtValidationException.class);
            }
        } finally { server.stop(0); }
    }
}
