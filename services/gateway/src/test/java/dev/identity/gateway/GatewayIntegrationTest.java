package dev.identity.gateway;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMetrics
@AutoConfigureWebTestClient
@Testcontainers
class GatewayIntegrationTest {
    @Container static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7.4-alpine").withExposedPorts(6379);
    static final RSAKey KEY;
    static final HttpServer UPSTREAM;
    static final String ISSUER = "https://issuer.test/realms/test";
    static {
        try {
            KEY = new RSAKeyGenerator(2048).keyID("test-key").generate();
            UPSTREAM = HttpServer.create(new InetSocketAddress(0), 0);
            UPSTREAM.createContext("/jwks", e -> {
                byte[] json = new JWKSet(KEY.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
                e.getResponseHeaders().set("Content-Type", "application/json");
                e.sendResponseHeaders(200, json.length);
                e.getResponseBody().write(json); e.close();
            });
            UPSTREAM.createContext("/api/", e -> {
                String spoof = Optional.ofNullable(e.getRequestHeaders().getFirst("X-User-Id")).orElse("");
                String requestId = e.getRequestHeaders().getFirst("X-Request-Id");
                byte[] json = ("{\"spoof\":\"" + spoof + "\",\"requestId\":\"" + requestId + "\"}").getBytes(StandardCharsets.UTF_8);
                e.getResponseHeaders().set("Content-Type", "application/json");
                e.sendResponseHeaders(200, json.length);
                e.getResponseBody().write(json); e.close();
            });
            UPSTREAM.start();
        } catch (Exception e) { throw new ExceptionInInitializerError(e); }
    }
    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry p) {
        p.add("spring.data.redis.host", REDIS::getHost);
        p.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        p.add("identity.issuer", () -> ISSUER);
        p.add("identity.jwk-set-uri", () -> "http://localhost:" + UPSTREAM.getAddress().getPort() + "/jwks");
        p.add("identity.platform-url", () -> "http://localhost:" + UPSTREAM.getAddress().getPort());
        p.add("identity.rate.replenish", () -> 1);
        p.add("identity.rate.burst", () -> 2);
    }
    @Autowired WebTestClient client;
    @Autowired TrafficLedger ledger;
    @AfterAll static void close() { UPSTREAM.stop(0); }

    static String token(String subject, String scope, String issuer, String audience, Instant expiration, RSAKey key) throws Exception {
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("test-key").build(),
                new JWTClaimsSet.Builder().issuer(issuer).subject(subject).audience(audience)
                        .issueTime(Date.from(Instant.now().minusSeconds(10)))
                        .expirationTime(Date.from(expiration)).claim("scope", scope).build());
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }
    static String token(String subject, String scope) throws Exception {
        return token(subject, scope, ISSUER, "identity-api", Instant.now().plusSeconds(300), KEY);
    }
    WebTestClient.ResponseSpec get(String path, String token) {
        return client.get().uri(path).header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();
    }

    @Test void anonymousAndMalformedTokensAreRejected() {
        client.get().uri("/api/projects").exchange().expectStatus().isUnauthorized();
        get("/api/projects", "malformed").expectStatus().isUnauthorized();
        assertThat(((Number) ledger.snapshot().get("denied")).longValue()).isGreaterThanOrEqualTo(2);
    }
    @Test void validatesIssuerAudienceExpirationAndSignature() throws Exception {
        for (String invalid : List.of(
                token("bad", "projects:read", "https://other.test", "identity-api", Instant.now().plusSeconds(300), KEY),
                token("bad", "projects:read", ISSUER, "another-api", Instant.now().plusSeconds(300), KEY),
                token("bad", "projects:read", ISSUER, "identity-api", Instant.now().minusSeconds(120), KEY),
                token("bad", "projects:read", ISSUER, "identity-api", Instant.now().plusSeconds(300), new RSAKeyGenerator(2048).generate()))) {
            get("/api/projects", invalid).expectStatus().isUnauthorized();
        }
    }
    @Test void forwardsAuthenticatedRequestsAndReplacesUntrustedHeaders() throws Exception {
        client.get().uri("/api/projects").headers(h -> {
            try { h.setBearerAuth(token("headers", "projects:read")); } catch (Exception e) { throw new RuntimeException(e); }
            h.set("X-User-Id", "administrator"); h.set("X-Request-Id", "attacker-selected");
        }).exchange().expectStatus().isOk()
                .expectHeader().exists("X-RateLimit-Remaining")
                .expectHeader().value("X-Request-Id", id -> assertThat(id).isNotEqualTo("attacker-selected"))
                .expectBody().jsonPath("$.spoof").isEqualTo("")
                .jsonPath("$.requestId").value(id -> assertThat(id.toString()).isNotEqualTo("attacker-selected"));
    }
    @Test void scopesAreEnforcedBeforeRouting() throws Exception {
        get("/api/projects", token("no-scope", "unrelated")).expectStatus().isForbidden();
        client.post().uri("/api/projects").headers(h -> {
            try { h.setBearerAuth(token("reader", "projects:read")); } catch (Exception e) { throw new RuntimeException(e); }
        }).exchange().expectStatus().isForbidden();
        get("/api/platform/audit", token("developer", "projects:read")).expectStatus().isForbidden();
        get("/unknown", token("unknown", "platform:read")).expectStatus().isForbidden();
        get("/api/platform/audit", token("admin", "platform:read")).expectStatus().isOk();
    }
    @Test void redisBucketsLimitEachIdentityIndependently() throws Exception {
        String jwt = token("burst-" + UUID.randomUUID(), "projects:read");
        List<CompletableFuture<Integer>> requests = new ArrayList<>();
        for (int i = 0; i < 20; i++) requests.add(CompletableFuture.supplyAsync(() ->
                get("/api/projects", jwt).returnResult(String.class).getStatus().value()));
        List<Integer> statuses = requests.stream().map(CompletableFuture::join).toList();
        assertThat(statuses).contains(200, 429).allMatch(status -> status == 200 || status == 429);
        get("/api/projects", token("other-" + UUID.randomUUID(), "projects:read")).expectStatus().isOk();
    }
    @Test void overviewAndMetricsRequireOperationsScope() throws Exception {
        get("/gateway/overview", token("developer", "projects:read")).expectStatus().isForbidden();
        get("/gateway/overview", token("ops", "platform:read")).expectStatus().isOk()
                .expectBody().jsonPath("$.startedAt").exists().jsonPath("$.events").isArray();
        client.get().uri("/actuator/health").exchange().expectStatus().isOk();
        client.get().uri("/actuator/prometheus").exchange().expectStatus().isUnauthorized();
        get("/actuator/prometheus", token("ops", "platform:read")).expectStatus().isOk();
    }
}
