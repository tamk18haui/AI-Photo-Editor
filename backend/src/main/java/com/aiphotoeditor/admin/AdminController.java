package com.aiphotoeditor.admin;

import static com.aiphotoeditor.admin.AdminDtos.*;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

/** All methods require an active admin; SecurityConfig also protects all admin URLs. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final AdminService admin;
    public AdminController(AdminService admin) { this.admin = admin; }

    @GetMapping("/me") public AdminMe me() { return admin.me(); }
    @GetMapping("/dashboard") public Dashboard dashboard() { return admin.dashboard(); }
    @GetMapping("/users")
    public Page<AdminUser> users(@RequestParam(defaultValue="0") int page,
                                  @RequestParam(defaultValue="12") int size,
                                  @RequestParam(required=false) String search,
                                  @RequestParam(required=false) String role,
                                  @RequestParam(required=false) String status,
                                  @RequestParam(required=false) String plan) {
        return admin.users(page,size,search,role,status,plan);
    }
    @GetMapping("/users/{id}") public AdminUser user(@PathVariable long id) { return admin.detail(id); }
    @PatchMapping("/users/{id}/role")
    public AdminUser role(@PathVariable long id,@Valid @RequestBody ChangeRole req) {
        admin.setRole(id,req);return admin.detail(id);
    }
    @PatchMapping("/users/{id}/status")
    public AdminUser status(@PathVariable long id,@Valid @RequestBody ChangeStatus req) {
        admin.setStatus(id,req);return admin.detail(id);
    }
    @PatchMapping("/users/{id}/plan")
    public AdminUser plan(@PathVariable long id,@Valid @RequestBody ChangePlan req) {
        admin.setPlan(id,req);return admin.detail(id);
    }
    @GetMapping("/audit")
    public Page<AuditItem> audit(@RequestParam(defaultValue="0") int page,
                                 @RequestParam(defaultValue="15") int size) {
        return admin.auditLog(page,size);
    }
}
