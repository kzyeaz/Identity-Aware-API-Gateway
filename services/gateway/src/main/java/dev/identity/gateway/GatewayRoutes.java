package dev.identity.gateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.ratelimit.KeyResolver;
import org.springframework.cloud.gateway.filter.ratelimit.RedisRateLimiter;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

@Configuration
public class GatewayRoutes {
    @Bean
    KeyResolver identityKeyResolver() {
        // Never trust a client-supplied identity header. Scope the bucket by verified issuer + subject.
        return exchange -> exchange.getPrincipal()
                .cast(JwtAuthenticationToken.class)
                .map(auth -> auth.getToken().getIssuer() + "|" + auth.getToken().getSubject());
    }

    @Bean
    RedisRateLimiter identityRateLimiter(@Value("${identity.rate.replenish}") int replenish,
                                        @Value("${identity.rate.burst}") int burst) {
        return new RedisRateLimiter(replenish, burst);
    }

    @Bean
    RouteLocator routes(RouteLocatorBuilder builder, RedisRateLimiter limiter, KeyResolver identityKeyResolver,
                        @Value("${identity.platform-url}") String platform) {
        return builder.routes()
                .route("projects-api", r -> r.path("/api/projects", "/api/projects/**")
                        .filters(f -> f.removeRequestHeader("X-User-Id")
                                .removeRequestHeader("X-Tenant-Id")
                                .requestRateLimiter(c -> c.setRateLimiter(limiter).setKeyResolver(identityKeyResolver)))
                        .uri(platform))
                .route("platform-api", r -> r.path("/api/platform/**")
                        .filters(f -> f.removeRequestHeader("X-User-Id")
                                .removeRequestHeader("X-Tenant-Id")
                                .requestRateLimiter(c -> c.setRateLimiter(limiter).setKeyResolver(identityKeyResolver)))
                        .uri(platform))
                .build();
    }
}
