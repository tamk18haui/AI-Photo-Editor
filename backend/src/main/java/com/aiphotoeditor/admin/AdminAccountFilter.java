package com.aiphotoeditor.admin;

import com.aiphotoeditor.common.ErrorResponse;
import com.aiphotoeditor.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/** Validate the live DB account status even for previously issued access tokens. */
public final class AdminAccountFilter extends OncePerRequestFilter {
    private final UserRepository users;
    private final AdminTrafficService traffic;
    private final ObjectMapper mapper;

    public AdminAccountFilter(UserRepository users, AdminTrafficService traffic, ObjectMapper mapper) {
        this.users = users; this.traffic = traffic; this.mapper = mapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken token)) {
            chain.doFilter(req, res);
            return;
        }
        long id;
        try { id = Long.parseLong(token.getToken().getSubject()); }
        catch (NumberFormatException e) { refuse(res, 401, "AUTH_TOKEN_EXPIRED", "Invalid user token"); return; }
        var user = users.findById(id).orElse(null);
        if (user == null) { refuse(res, 401, "AUTH_TOKEN_EXPIRED", "Account no longer exists"); return; }
        if (!"ACTIVE".equals(user.accountStatus)) {
            SecurityContextHolder.clearContext();
            refuse(res, 403, "ACCOUNT_BLOCKED", "This account has been disabled");
            return;
        }
        chain.doFilter(req, res);
        if (req.getRequestURI().startsWith(req.getContextPath() + "/api/") && res.getStatus() < 500) {
            traffic.recordAuthenticatedRequest(id);
        }
    }

    private void refuse(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding("UTF-8");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getWriter(), ErrorResponse.of(status, code, message));
    }
}
