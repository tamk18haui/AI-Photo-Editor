package com.aiphotoeditor.admin;

import static com.aiphotoeditor.admin.AdminDtos.*;

import com.aiphotoeditor.auth.CurrentUser;
import com.aiphotoeditor.auth.RefreshTokenRepository;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.user.User;
import com.aiphotoeditor.user.UserRepository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminService {
    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final CurrentUser current;
    private final JdbcTemplate jdbc;

    public AdminService(UserRepository users, RefreshTokenRepository refreshTokens,
                        CurrentUser current, JdbcTemplate jdbc) {
        this.users = users; this.refreshTokens = refreshTokens; this.current = current; this.jdbc = jdbc;
    }

    public User requireAdmin() {
        User actor = users.findById(current.id())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_TOKEN_EXPIRED", "User not found"));
        if (!"ACTIVE".equals(actor.accountStatus) || !"ADMIN".equals(actor.accountRole))
            throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_ONLY", "Administrator permission required");
        return actor;
    }

    @Transactional(readOnly = true)
    public AdminMe me() {
        User u = requireAdmin();
        return new AdminMe(u.id, u.email, u.displayName, u.accountRole);
    }

    private long count(String sql, Object... args) {
        Long result = jdbc.queryForObject(sql, Long.class, args);
        return result == null ? 0 : result;
    }

    @Transactional(readOnly = true)
    public Dashboard dashboard() {
        requireAdmin();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Instant from = today.minusDays(6).atStartOfDay().toInstant(ZoneOffset.UTC);
        long usersTotal = count("SELECT COUNT(*) FROM users");
        long active = count("SELECT COUNT(*) FROM users WHERE account_status='ACTIVE'");
        long blocked = count("SELECT COUNT(*) FROM users WHERE account_status='BLOCKED'");
        long admins = count("SELECT COUNT(*) FROM users WHERE account_role='ADMIN'");
        long premium = count("SELECT COUNT(*) FROM users WHERE subscription_plan='PREMIUM' AND premium_until > ?",
                Timestamp.from(Instant.now()));
        long recent = count("SELECT COUNT(*) FROM users WHERE created_at >= ?", Timestamp.from(from));
        long projects = count("SELECT COUNT(*) FROM projects");
        long assets = count("SELECT COUNT(*) FROM assets");
        long bytes = count("SELECT COALESCE(SUM(file_size),0) FROM assets");
        long jobs = count("SELECT COUNT(*) FROM ai_jobs");
        long completed = count("SELECT COUNT(*) FROM ai_jobs WHERE status='COMPLETED'");
        long edits = count("SELECT COUNT(*) FROM edit_histories WHERE action_type='EDITOR_STATE_SAVE' AND created_at >= ?", Timestamp.from(from));
        long requestsToday = count("SELECT COALESCE(SUM(request_count),0) FROM api_traffic_daily WHERE day=?",
                java.sql.Date.valueOf(today));
        long requests7d = count("SELECT COALESCE(SUM(request_count),0) FROM api_traffic_daily WHERE day>=?",
                java.sql.Date.valueOf(today.minusDays(6)));
        long active7d = count("SELECT COUNT(DISTINCT user_id) FROM api_traffic_daily WHERE day>=?",
                java.sql.Date.valueOf(today.minusDays(6)));
        var trend = new ArrayList<DayMetric>();
        for (int d = 6; d >= 0; d--) {
            LocalDate day = today.minusDays(d);
            java.sql.Date date = java.sql.Date.valueOf(day);
            Timestamp start = Timestamp.from(day.atStartOfDay().toInstant(ZoneOffset.UTC));
            Timestamp end = Timestamp.from(day.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC));
            trend.add(new DayMetric(day.toString(),
                    count("SELECT COALESCE(SUM(request_count),0) FROM api_traffic_daily WHERE day=?", date),
                    count("SELECT COUNT(DISTINCT user_id) FROM api_traffic_daily WHERE day=?", date),
                    count("SELECT COUNT(*) FROM users WHERE created_at>=? AND created_at<?", start, end)));
        }
        return new Dashboard(usersTotal, active, blocked, admins, premium, recent,
                projects, assets, bytes, jobs, completed, edits, requestsToday, requests7d, active7d, trend);
    }

    private static Instant instant(ResultSet rs, String name) throws SQLException {
        Timestamp t = rs.getTimestamp(name);
        return t == null ? null : t.toInstant();
    }

    private AdminUser mapUser(ResultSet rs, int n) throws SQLException {
        return new AdminUser(rs.getLong("id"), rs.getString("email"), rs.getString("display_name"),
                rs.getString("account_role"), rs.getString("account_status"), rs.getString("subscription_plan"),
                instant(rs, "premium_until"), instant(rs, "created_at"), instant(rs, "last_login_at"),
                rs.getLong("projects_count"), rs.getLong("jobs_count"));
    }

    @Transactional(readOnly = true)
    public Page<AdminUser> users(int page, int size, String query, String role, String status, String plan) {
        requireAdmin();
        if (page < 0 || size < 1 || size > 50)
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Invalid pagination");
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (query != null && !query.isBlank()) {
            String q = query.strip();
            if (q.length() > 100) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Search too long");
            // LIKE wildcards are escaped, so '%' and '_' are treated as literal search text.
            String escaped = q.toLowerCase().replace("!", "!!").replace("%", "!%").replace("_", "!_");
            where.append(" AND (LOWER(u.email) LIKE ? ESCAPE '!' OR LOWER(COALESCE(u.display_name,'')) LIKE ? ESCAPE '!')");
            params.add("%" + escaped + "%"); params.add("%" + escaped + "%");
        }
        if (role != null && !role.isBlank()) { validate(role, "USER", "ADMIN"); where.append(" AND u.account_role=?"); params.add(role); }
        if (status != null && !status.isBlank()) { validate(status, "ACTIVE", "BLOCKED"); where.append(" AND u.account_status=?"); params.add(status); }
        if (plan != null && !plan.isBlank()) { validate(plan, "FREE", "PREMIUM"); where.append(" AND u.subscription_plan=?"); params.add(plan); }
        long total = count("SELECT COUNT(*) FROM users u" + where, params.toArray());
        List<Object> paging = new ArrayList<>(params); paging.add(size); paging.add((long) page * size);
        String sql = "SELECT u.id,u.email,u.display_name,u.account_role,u.account_status,u.subscription_plan," +
                "u.premium_until,u.created_at,u.last_login_at," +
                "(SELECT COUNT(*) FROM projects p WHERE p.owner_id=u.id) projects_count," +
                "(SELECT COUNT(*) FROM ai_jobs j WHERE j.created_by_user_id=u.id) jobs_count " +
                "FROM users u" + where + " ORDER BY u.created_at DESC,u.id DESC LIMIT ? OFFSET ?";
        return new Page<>(jdbc.query(sql, this::mapUser, paging.toArray()), total, page, size,
                (int) Math.ceil((double) total / size));
    }

    @Transactional(readOnly = true)
    public AdminUser detail(long id) {
        requireAdmin();
        String sql = "SELECT u.id,u.email,u.display_name,u.account_role,u.account_status,u.subscription_plan," +
                "u.premium_until,u.created_at,u.last_login_at," +
                "(SELECT COUNT(*) FROM projects p WHERE p.owner_id=u.id) projects_count," +
                "(SELECT COUNT(*) FROM ai_jobs j WHERE j.created_by_user_id=u.id) jobs_count FROM users u WHERE u.id=?";
        return jdbc.query(sql, this::mapUser, id).stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "User not found"));
    }

    private static void validate(String value, String... allowed) {
        for (String a : allowed) if (a.equals(value)) return;
        throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Unsupported value");
    }

    private User target(long id) {
        return users.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "User not found"));
    }

    private void audit(User actor, User user, String action, String detail) {
        jdbc.update("INSERT INTO admin_audit_logs(actor_user_id,target_user_id,action,detail) VALUES (?,?,?,?)",
                actor.id, user.id, action, detail);
    }

    @Transactional
    public void setStatus(long id, ChangeStatus request) {
        User actor = requireAdmin(); User user = target(id);
        validate(request.status(), "ACTIVE", "BLOCKED");
        if (user.id.equals(actor.id)) throw new ApiException(HttpStatus.CONFLICT, "ADMIN_SELF_LOCK", "Cannot change own account status");
        if ("ADMIN".equals(user.accountRole) && "BLOCKED".equals(request.status()))
            throw new ApiException(HttpStatus.CONFLICT, "ADMIN_PROTECTED", "Demote administrator before blocking");
        if (request.status().equals(user.accountStatus)) return;
        String before = user.accountStatus;
        user.accountStatus = request.status();
        users.saveAndFlush(user);
        if ("BLOCKED".equals(user.accountStatus)) refreshTokens.revokeAll(user.id, Instant.now());
        audit(actor, user, "ACCOUNT_STATUS", before + " -> " + user.accountStatus);
    }

    @Transactional
    public void setRole(long id, ChangeRole request) {
        User actor = requireAdmin(); User user = target(id);
        validate(request.role(), "ADMIN", "USER");
        if (user.id.equals(actor.id)) throw new ApiException(HttpStatus.CONFLICT, "ADMIN_SELF_ROLE", "Cannot change your own role");
        if (!"ACTIVE".equals(user.accountStatus) && "ADMIN".equals(request.role()))
            throw new ApiException(HttpStatus.CONFLICT, "ADMIN_BLOCKED_USER", "Unblock account before promotion");
        if (request.role().equals(user.accountRole)) return;
        String before = user.accountRole;
        user.accountRole = request.role();
        users.saveAndFlush(user);
        // Admin authorization always checks the database; no stale-role JWT bypass.
        refreshTokens.revokeAll(user.id, Instant.now());
        audit(actor, user, "ACCOUNT_ROLE", before + " -> " + user.accountRole);
    }

    @Transactional
    public void setPlan(long id, ChangePlan request) {
        User actor = requireAdmin(); User user = target(id);
        validate(request.plan(), "FREE", "PREMIUM");
        if ("PREMIUM".equals(request.plan()) &&
                (request.premiumUntil() == null || !request.premiumUntil().isAfter(Instant.now())))
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PREMIUM_DATE", "Premium requires a future expiration");
        String before = user.subscriptionPlan;
        user.subscriptionPlan = request.plan();
        user.premiumUntil = "PREMIUM".equals(request.plan()) ? request.premiumUntil() : null;
        users.saveAndFlush(user);
        audit(actor, user, "SUBSCRIPTION_PLAN", before + " -> " + user.subscriptionPlan +
                (user.premiumUntil == null ? "" : " until " + user.premiumUntil.toString()));
    }

    @Transactional(readOnly = true)
    public Page<AuditItem> auditLog(int page, int size) {
        requireAdmin();
        if (page < 0 || size < 1 || size > 50)
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Invalid pagination");
        long total = count("SELECT COUNT(*) FROM admin_audit_logs");
        String sql = "SELECT a.id,a.actor_user_id,actor.email AS actor_email,a.target_user_id," +
                "target.email AS target_email,a.action,a.detail,a.created_at FROM admin_audit_logs a " +
                "JOIN users actor ON actor.id=a.actor_user_id JOIN users target ON target.id=a.target_user_id " +
                "ORDER BY a.id DESC LIMIT ? OFFSET ?";
        var list = jdbc.query(sql, (rs, row) -> new AuditItem(rs.getLong("id"), rs.getLong("actor_user_id"),
                rs.getString("actor_email"), rs.getLong("target_user_id"), rs.getString("target_email"),
                rs.getString("action"), rs.getString("detail"), instant(rs, "created_at")), size, (long) page * size);
        return new Page<>(list, total, page, size, (int) Math.ceil((double) total / size));
    }
}
