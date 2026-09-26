package com.example.crm.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.example.crm.App;
import com.example.crm.repository.InMemoryCustomerRepository;
import com.example.crm.service.CustomerService;
import com.fasterxml.jackson.databind.JsonNode;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Exercises the HTTP layer against a real server on an ephemeral port. */
class CustomerHandlerTest {
  private final HttpClient client = HttpClient.newHttpClient();
  private HttpServer server;
  private String baseUrl;

  @BeforeEach
  void startServer() throws IOException {
    CustomerService service = new CustomerService(new InMemoryCustomerRepository());
    service.create("Nguyen Van An", "an@example.com");
    server = App.start(0, service);
    baseUrl = "http://localhost:" + server.getAddress().getPort() + "/api/customers";
  }

  @AfterEach
  void stopServer() {
    server.stop(0);
  }

  private HttpResponse<String> get(String path) throws Exception {
    return client.send(HttpRequest.newBuilder(URI.create(baseUrl + path)).GET().build(), HttpResponse.BodyHandlers.ofString());
  }

  private HttpResponse<String> post(String json) throws Exception {
    HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(json))
        .build();
    return client.send(request, HttpResponse.BodyHandlers.ofString());
  }

  @Test
  @DisplayName("GET /api/customers lists customers as JSON")
  void listReturnsCustomers() throws Exception {
    HttpResponse<String> response = get("");

    assertEquals(200, response.statusCode());
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals(1, body.size());
    assertEquals("an@example.com", body.get(0).get("email").asText());
  }

  @Test
  @DisplayName("POST /api/customers returns 201 with the created customer")
  void createReturns201() throws Exception {
    HttpResponse<String> response = post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\"}");

    assertEquals(201, response.statusCode());
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals(2, body.get("id").asLong());
    assertEquals("ACTIVE", body.get("status").asText());
  }

  @Test
  @DisplayName("POST /api/customers with invalid fields returns an RFC 9457 problem")
  void createInvalidReturnsProblem() throws Exception {
    HttpResponse<String> response = post("{\"name\":\"\",\"email\":\"x\"}");

    assertEquals(400, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals("must not be blank", body.get("errors").get("name").asText());
  }

  @Test
  @DisplayName("GET /api/customers/{id} returns 404 for an unknown id")
  void getUnknownReturns404() throws Exception {
    HttpResponse<String> response = get("/42");

    assertEquals(404, response.statusCode());
    assertEquals("Not Found", CustomerHandler.JSON.readTree(response.body()).get("title").asText());
  }
}
