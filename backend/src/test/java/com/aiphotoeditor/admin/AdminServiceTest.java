package com.aiphotoeditor.admin;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.aiphotoeditor.admin.AdminDtos.*;
import com.aiphotoeditor.auth.CurrentUser;
import com.aiphotoeditor.auth.RefreshTokenRepository;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.user.User;
import com.aiphotoeditor.user.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class AdminServiceTest {
    @Mock UserRepository users;
    @Mock RefreshTokenRepository tokens;
    @Mock CurrentUser current;
    @Mock JdbcTemplate jdbc;
    AdminService admin;
    User actor;

    @BeforeEach void setup() {
        admin = new AdminService(users,tokens,current,jdbc);
        actor = new User(); actor.id = 7L; actor.email = "admin@example.test";
        when(current.id()).thenReturn(7L);
    }

    @Test void ordinaryUserCannotUseAdminServices() {
        when(users.findById(7L)).thenReturn(Optional.of(actor));
        ApiException ex = assertThrows(ApiException.class, () -> admin.me());
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatus());
    }

    @Test void blockedAdministratorCannotAccessConsole() {
        actor.accountRole="ADMIN"; actor.accountStatus="BLOCKED";
        when(users.findById(7L)).thenReturn(Optional.of(actor));
        ApiException ex = assertThrows(ApiException.class, () -> admin.me());
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatus());
    }

    @Test void administratorCanAccessOwnIdentity() {
        actor.accountRole="ADMIN";
        when(users.findById(7L)).thenReturn(Optional.of(actor));
        AdminMe me = admin.me();
        assertEquals("ADMIN", me.role()); assertEquals(7L, me.id());
    }

    @Test void cannotBlockSelf() {
        actor.accountRole="ADMIN";
        when(users.findById(7L)).thenReturn(Optional.of(actor));
        ApiException ex = assertThrows(ApiException.class, () -> admin.setStatus(7L,new ChangeStatus("BLOCKED")));
        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
        verify(users,never()).saveAndFlush(any());
    }
}
