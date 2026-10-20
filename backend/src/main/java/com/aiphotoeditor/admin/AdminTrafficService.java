package com.aiphotoeditor.admin;

import java.time.LocalDate;
import java.time.ZoneOffset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Aggregate request traffic without storing URLs, IPs or personal request bodies. */
@Service
public class AdminTrafficService {
    private static final Logger LOG = LoggerFactory.getLogger(AdminTrafficService.class);
    private final JdbcTemplate jdbc;

    public AdminTrafficService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void recordAuthenticatedRequest(long userId) {
        try {
            jdbc.update("INSERT INTO api_traffic_daily (day,user_id,request_count) VALUES (?,?,1) " +
                            "ON DUPLICATE KEY UPDATE request_count=request_count+1",
                    java.sql.Date.valueOf(LocalDate.now(ZoneOffset.UTC)), userId);
        } catch (RuntimeException ex) {
            // Analytics must NEVER take down editing or login requests.
            LOG.warn("Could not record aggregated API traffic: {}", ex.getClass().getSimpleName());
        }
    }
}
