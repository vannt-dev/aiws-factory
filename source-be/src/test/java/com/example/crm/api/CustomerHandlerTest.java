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
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/** Exercises the HTTP layer against a real server on an ephemeral port. */
class CustomerHandlerTest {
  private final HttpClient client = HttpClient.newHttpClient();
  private HttpServer server;
  private String baseUrl;

  @BeforeEach
  void startServer() throws IOException {
    CustomerService service = new CustomerService(new InMemoryCustomerRepository());
    service.create("Nguyen Van An", "an@example.com", null);
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

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("bodiesWithoutPhone")
  @DisplayName("TC-27: POST /api/customers without a phone number returns 201 with a null phone")
  void createWithoutPhoneReturnsNullPhone(String json) throws Exception {
    HttpResponse<String> response = post(json);

    assertEquals(201, response.statusCode());
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertTrue(body.has("phone"));
    assertTrue(body.get("phone").isNull());
    assertEquals("ACTIVE", body.get("status").asText());
  }

  private static Stream<String> bodiesWithoutPhone() {
    return Stream.of(
        "{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\"}",
        "{\"name\":\"Le Van Cuong\",\"email\":\"cuong@example.com\",\"phone\":null}",
        "{\"name\":\"Pham Thi Dung\",\"email\":\"dung@example.com\",\"phone\":\"   \"}");
  }

  @Test
  @DisplayName("TC-28: POST /api/customers normalizes the phone number and a later GET returns it")
  void createNormalizesPhoneAndGetReturnsIt() throws Exception {
    HttpResponse<String> created =
        post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\" (+84) 912.345-678 \"}");

    assertEquals(201, created.statusCode());
    JsonNode createdBody = CustomerHandler.JSON.readTree(created.body());
    assertEquals("0912345678", createdBody.get("phone").asText());

    HttpResponse<String> fetched = get("/" + createdBody.get("id").asLong());

    assertEquals(200, fetched.statusCode());
    assertEquals("0912345678", CustomerHandler.JSON.readTree(fetched.body()).get("phone").asText());
  }

  @Test
  @DisplayName("TC-29: POST /api/customers with an invalid phone number returns an RFC 9457 problem")
  void createWithInvalidPhoneReturnsProblem() throws Exception {
    HttpResponse<String> response =
        post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0412345678\"}");

    assertEquals(400, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals("Validation failed", body.get("title").asText());
    assertEquals(1, body.get("errors").size());
    assertEquals("must be a valid phone number", body.get("errors").get("phone").asText());
    assertEquals(1, CustomerHandler.JSON.readTree(get("").body()).size());
  }

  @Test
  @DisplayName("TC-30: POST /api/customers with the phone number of an active customer returns an RFC 9457 problem")
  void createWithDuplicatePhoneReturnsProblem() throws Exception {
    HttpResponse<String> existing =
        post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0912345678\"}");
    assertEquals(201, existing.statusCode());

    HttpResponse<String> response =
        post("{\"name\":\"Le Van Cuong\",\"email\":\"cuong@example.com\",\"phone\":\"+84 912 345 678\"}");

    assertEquals(400, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals(1, body.get("errors").size());
    assertEquals("is already used by another customer", body.get("errors").get("phone").asText());
    assertEquals(2, CustomerHandler.JSON.readTree(get("").body()).size());
  }

  @Test
  @DisplayName("TC-31: GET /api/customers returns the phone field for every customer")
  void listReturnsPhoneForEveryCustomer() throws Exception {
    HttpResponse<String> existing =
        post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0912345678\"}");
    assertEquals(201, existing.statusCode());

    HttpResponse<String> response = get("");

    assertEquals(200, response.statusCode());
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals(2, body.size());
    assertTrue(body.get(0).has("phone"));
    assertTrue(body.get(0).get("phone").isNull());
    assertTrue(body.get(1).get("phone").isTextual());
    assertEquals("0912345678", body.get(1).get("phone").asText());
  }

  @Test
  @DisplayName("TC-32: GET /api/customers/{id} returns the phone number of the customer")
  void getReturnsPhone() throws Exception {
    HttpResponse<String> existing =
        post("{\"name\":\"Le Van Cuong\",\"email\":\"cuong@example.com\",\"phone\":\"02438251234\"}");
    assertEquals(201, existing.statusCode());

    HttpResponse<String> response = get("/2");

    assertEquals(200, response.statusCode());
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals(2, body.get("id").asLong());
    assertEquals("02438251234", body.get("phone").asText());
  }
}
