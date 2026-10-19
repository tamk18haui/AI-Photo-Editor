package com.aiphotoeditor.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

@Configuration
public class PasswordMailConfiguration {
    @Bean
    @ConditionalOnProperty(name = "PASSWORD_RESET_EMAIL_ENABLED", havingValue = "true")
    public JavaMailSender passwordResetMailSender(
            @Value("${SMTP_HOST:}") String host,
            @Value("${SMTP_PORT:587}") int port,
            @Value("${SMTP_USERNAME:}") String username,
            @Value("${SMTP_PASSWORD:}") String password,
            @Value("${SMTP_STARTTLS:true}") boolean starttls) {
        if (host.isBlank()) {
            throw new IllegalStateException("SMTP_HOST must be set when PASSWORD_RESET_EMAIL_ENABLED=true");
        }
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(host);
        sender.setPort(port);
        sender.setProtocol("smtp");
        if (!username.isBlank()) {
            sender.setUsername(username);
            sender.setPassword(password);
        }
        var props = sender.getJavaMailProperties();
        props.put("mail.smtp.auth", Boolean.toString(!username.isBlank()));
        props.put("mail.smtp.starttls.enable", Boolean.toString(starttls));
        props.put("mail.smtp.starttls.required", Boolean.toString(starttls));
        props.put("mail.smtp.connectiontimeout", "10000");
        props.put("mail.smtp.timeout", "10000");
        props.put("mail.smtp.writetimeout", "10000");
        return sender;
    }
}
