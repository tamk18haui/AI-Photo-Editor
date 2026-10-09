package com.aiphotoeditor.auth;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
public interface OauthAccountRepository extends JpaRepository<OauthAccount,Long>{
 Optional<OauthAccount> findByProviderAndProviderSubject(String provider,String providerSubject);
}
