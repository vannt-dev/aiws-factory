package com.example.crm.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
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

  private HttpResponse<String> put(String path, String json) throws Exception {
    HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
        .header("Content-Type", "application/json")
        .PUT(HttpRequest.BodyPublishers.ofString(json))
        .build();
    return client.send(request, HttpResponse.BodyHandlers.ofString());
  }

  private JsonNode customers() throws Exception {
    return CustomerHandler.JSON.readTree(get("").body());
  }

  private static Map<String, String> errorsOf(JsonNode body) {
    Map<String, String> errors = new HashMap<>();
    body.get("errors").fields().forEachRemaining(e -> errors.put(e.getKey(), e.getValue().asText()));
    return errors;
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

  @Test
  @DisplayName("TC-61: PUT /api/customers/{id} returns 200 with the updated customer and GET reads it back")
  void updateReturns200AndGetReadsItBack() throws Exception {
    HttpResponse<String> response =
        put("/1", "{\"name\":\"  Nguyen Van Anh \",\"email\":\" anh@example.com \",\"phone\":\" 0987.654-321 \"}");

    assertEquals(200, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals(1, body.get("id").asLong());
    assertEquals("Nguyen Van Anh", body.get("name").asText());
    assertEquals("anh@example.com", body.get("email").asText());
    assertEquals("0987654321", body.get("phone").asText());
    assertEquals("ACTIVE", body.get("status").asText());

    JsonNode fetched = CustomerHandler.JSON.readTree(get("/1").body());
    assertEquals(body, fetched);
    assertEquals(1, customers().size());
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("bodiesWithoutPhoneForUpdate")
  @DisplayName("TC-62: PUT /api/customers/{id} without a phone number returns 200 with a null phone")
  void updateWithoutPhoneClearsPhone(String json) throws Exception {
    assertEquals(201, post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0912345678\"}").statusCode());

    HttpResponse<String> response = put("/2", json);

    assertEquals(200, response.statusCode());
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertTrue(body.has("phone"));
    assertTrue(body.get("phone").isNull());
    assertEquals("ACTIVE", body.get("status").asText());

    HttpResponse<String> fetched = get("/2");

    assertEquals(200, fetched.statusCode());
    assertTrue(CustomerHandler.JSON.readTree(fetched.body()).get("phone").isNull());
  }

  private static Stream<String> bodiesWithoutPhoneForUpdate() {
    return Stream.of(
        "{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\"}",
        "{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":null}",
        "{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"\"}",
        "{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"   \"}");
  }

  @Test
  @DisplayName("TC-63: PUT /api/customers/{id} ignores id and status in the body")
  void updateIgnoresIdAndStatusInBody() throws Exception {
    HttpResponse<String> response =
        put("/1", "{\"id\":99,\"name\":\"Nguyen Van Anh\",\"email\":\"anh@example.com\",\"phone\":\"0987654321\",\"status\":\"INACTIVE\"}");

    assertEquals(200, response.statusCode());
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals(1, body.get("id").asLong());
    assertEquals("ACTIVE", body.get("status").asText());
    assertEquals("Nguyen Van Anh", body.get("name").asText());

    JsonNode fetched = CustomerHandler.JSON.readTree(get("/1").body());
    assertEquals("ACTIVE", fetched.get("status").asText());
    assertEquals("0987654321", fetched.get("phone").asText());
    assertEquals(404, get("/99").statusCode());
    assertEquals(1, customers().size());
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("invalidUpdateBodies")
  @DisplayName("TC-64: PUT /api/customers/{id} with invalid fields returns a 400 problem with errors and changes nothing")
  void updateInvalidReturnsProblemAndChangesNothing(String json, Map<String, String> expectedErrors) throws Exception {
    JsonNode before = customers();

    HttpResponse<String> response = put("/1", json);

    assertEquals(400, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals("Validation failed", body.get("title").asText());
    assertEquals(expectedErrors, errorsOf(body));
    assertEquals(before, customers());
  }

  private static Stream<Arguments> invalidUpdateBodies() {
    return Stream.of(
        Arguments.of("{\"email\":\"an@example.com\"}", Map.of("name", "must not be blank")),
        Arguments.of("{\"name\":\"Nguyen Van An\"}", Map.of("email", "must be a valid email address")),
        Arguments.of(
            "{\"name\":\"Nguyen Van An\",\"email\":\"an@example.com\",\"phone\":\"0412345678\"}",
            Map.of("phone", "must be a valid phone number")),
        Arguments.of(
            "{\"name\":\"\",\"email\":\"x\",\"phone\":\"0412345678\"}",
            Map.of(
                "name", "must not be blank",
                "email", "must be a valid email address",
                "phone", "must be a valid phone number")));
  }

  @Test
  @DisplayName("TC-65: PUT /api/customers/{id} with the email or phone of another customer returns a 400 problem")
  void updateWithValueOfAnotherCustomerReturnsProblem() throws Exception {
    assertEquals(201, post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0912345678\"}").statusCode());
    JsonNode before = customers();
    assertEquals(2, before.size());

    HttpResponse<String> byEmail = put("/1", "{\"name\":\"Nguyen Van An\",\"email\":\"BINH@Example.com\"}");

    assertEquals(400, byEmail.statusCode());
    assertTrue(byEmail.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    assertEquals(Map.of("email", "is already used by another customer"), errorsOf(CustomerHandler.JSON.readTree(byEmail.body())));

    HttpResponse<String> byPhone =
        put("/1", "{\"name\":\"Nguyen Van An\",\"email\":\"an@example.com\",\"phone\":\"+84 912 345 678\"}");

    assertEquals(400, byPhone.statusCode());
    assertTrue(byPhone.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    assertEquals(Map.of("phone", "is already used by another customer"), errorsOf(CustomerHandler.JSON.readTree(byPhone.body())));

    assertEquals(before, customers());
  }

  @Test
  @DisplayName("TC-66: PUT /api/customers/{id} keeps its own email and phone and returns 200")
  void updateKeepsOwnEmailAndPhone() throws Exception {
    assertEquals(201, post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0912345678\"}").statusCode());

    HttpResponse<String> response =
        put("/2", "{\"name\":\"Tran Thi Binh An\",\"email\":\"BINH@Example.com\",\"phone\":\"+84 912 345 678\"}");

    assertEquals(200, response.statusCode());
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals(2, body.get("id").asLong());
    assertEquals("Tran Thi Binh An", body.get("name").asText());
    assertEquals("BINH@Example.com", body.get("email").asText());
    assertEquals("0912345678", body.get("phone").asText());

    JsonNode fetched = CustomerHandler.JSON.readTree(get("/2").body());
    assertEquals("BINH@Example.com", fetched.get("email").asText());
    assertEquals("0912345678", fetched.get("phone").asText());
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("unknownCustomerBodies")
  @DisplayName("TC-67: PUT /api/customers/{id} for an unknown id returns a 404 problem before validation")
  void updateUnknownIdReturns404BeforeValidation(String json) throws Exception {
    JsonNode before = customers();

    HttpResponse<String> response = put("/999", json);

    assertEquals(404, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals("Not Found", body.get("title").asText());
    assertEquals("Customer 999 not found", body.get("detail").asText());
    assertFalse(body.has("errors"));
    assertEquals(before, customers());
  }

  private static Stream<String> unknownCustomerBodies() {
    return Stream.of(
        "{\"name\":\"Nguyen Van Anh\",\"email\":\"anh@example.com\",\"phone\":\"0987654321\"}",
        "{\"name\":\"\",\"email\":\"x\",\"phone\":\"0412345678\"}");
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("malformedUpdateRequests")
  @DisplayName("TC-68: PUT /api/customers/{id} with a body that is not valid JSON returns 400 Malformed JSON before the lookup")
  void updateMalformedJsonReturns400(String path) throws Exception {
    JsonNode before = customers();

    HttpResponse<String> response = put(path, "{\"name\":");

    assertEquals(400, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals("Malformed JSON", body.get("title").asText());
    assertEquals("The request body is not valid JSON", body.get("detail").asText());
    assertFalse(body.has("errors"));
    assertEquals(before, customers());
  }

  private static Stream<String> malformedUpdateRequests() {
    return Stream.of("/1", "/999");
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("unroutedUpdatePaths")
  @DisplayName("TC-69: PUT on a path that is not /api/customers/{digits} returns the 404 fallback")
  void updateOnUnroutedPathReturnsFallback(String path, String detail) throws Exception {
    JsonNode before = customers();

    HttpResponse<String> response = put(path, "{\"name\":\"Nguyen Van Anh\",\"email\":\"anh@example.com\",\"phone\":\"0987654321\"}");

    assertEquals(404, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals("Not Found", body.get("title").asText());
    assertEquals(detail, body.get("detail").asText());
    assertEquals(before, customers());
  }

  private static Stream<Arguments> unroutedUpdatePaths() {
    return Stream.of(
        Arguments.of("", "No route for PUT /api/customers"),
        Arguments.of("/abc", "No route for PUT /api/customers/abc"),
        Arguments.of("/-1", "No route for PUT /api/customers/-1"));
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("deactivateBodies")
  @DisplayName("TC-91: PUT /api/customers/{id}/status deactivating returns 200 with the customer and GET reads it back")
  void deactivateReturns200AndGetReadsItBack(
      long id, String body, String expectedName, String expectedEmail, String expectedPhone) throws Exception {
    assertEquals(201, post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0912345678\"}").statusCode());
    JsonNode before = customers();

    HttpResponse<String> response = put("/" + id + "/status", body);

    assertEquals(200, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/json"));
    JsonNode responseBody = CustomerHandler.JSON.readTree(response.body());
    assertEquals(id, responseBody.get("id").asLong());
    assertEquals("INACTIVE", responseBody.get("status").asText());
    assertEquals(expectedName, responseBody.get("name").asText());
    assertEquals(expectedEmail, responseBody.get("email").asText());
    if (expectedPhone == null) {
      assertTrue(responseBody.has("phone"));
      assertTrue(responseBody.get("phone").isNull());
    } else {
      assertEquals(expectedPhone, responseBody.get("phone").asText());
    }

    JsonNode fetched = CustomerHandler.JSON.readTree(get("/" + id).body());
    assertEquals(responseBody, fetched);

    JsonNode after = customers();
    assertEquals(2, after.size());
    int otherIndex = id == 1 ? 1 : 0;
    assertEquals(before.get(otherIndex), after.get(otherIndex));
  }

  private static Stream<Arguments> deactivateBodies() {
    return Stream.of(
        Arguments.of(1L, "{\"status\":\"INACTIVE\"}", "Nguyen Van An", "an@example.com", null),
        Arguments.of(2L, "{\"status\":\"INACTIVE\"}", "Tran Thi Binh", "binh@example.com", "0912345678"),
        Arguments.of(
            2L,
            "{\"id\":1,\"name\":\"X\",\"email\":\"x@example.com\",\"phone\":\"0987654321\",\"status\":\"INACTIVE\"}",
            "Tran Thi Binh",
            "binh@example.com",
            "0912345678"));
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("reactivatedCustomerIds")
  @DisplayName("TC-92: PUT /api/customers/{id}/status reactivating returns 200 and the customer is exactly as before deactivation")
  void reactivateReturns200AndRestoresCustomer(long id) throws Exception {
    assertEquals(201, post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0912345678\"}").statusCode());
    assertEquals(201, post("{\"name\":\"Le Van Cuong\",\"email\":\"cuong@example.com\"}").statusCode());
    JsonNode before = customers();
    assertEquals(200, put("/" + id + "/status", "{\"status\":\"INACTIVE\"}").statusCode());

    HttpResponse<String> response = put("/" + id + "/status", "{\"status\":\"ACTIVE\"}");

    assertEquals(200, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals("ACTIVE", body.get("status").asText());
    assertEquals(before.get((int) id - 1), body);

    JsonNode fetched = CustomerHandler.JSON.readTree(get("/" + id).body());
    assertEquals(body, fetched);
    assertEquals(before, customers());
  }

  private static Stream<Long> reactivatedCustomerIds() {
    return Stream.of(1L, 2L);
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("phoneHandoverRequests")
  @DisplayName("TC-93: PUT /api/customers/{id}/status rejects reactivation when the phone was given to an ACTIVE customer")
  void reactivateRejectsWhenPhoneWasGivenToActiveCustomer(String method, String path, String json, int expectedStatus)
      throws Exception {
    assertEquals(201, post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0912345678\"}").statusCode());
    assertEquals(200, put("/2/status", "{\"status\":\"INACTIVE\"}").statusCode());

    HttpResponse<String> handover = method.equals("POST") ? post(json) : put(path, json);
    assertEquals(expectedStatus, handover.statusCode());
    JsonNode before = customers();

    HttpResponse<String> response = put("/2/status", "{\"status\":\"ACTIVE\"}");

    assertEquals(400, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals("Validation failed", body.get("title").asText());
    assertEquals(Map.of("phone", "is already used by another customer"), errorsOf(body));
    assertEquals("INACTIVE", CustomerHandler.JSON.readTree(get("/2").body()).get("status").asText());
    assertEquals(before, customers());
  }

  private static Stream<Arguments> phoneHandoverRequests() {
    return Stream.of(
        Arguments.of("POST", "", "{\"name\":\"Le Van Cuong\",\"email\":\"cuong@example.com\",\"phone\":\"0912345678\"}", 201),
        Arguments.of("PUT", "/1", "{\"name\":\"Nguyen Van An\",\"email\":\"an@example.com\",\"phone\":\"0912345678\"}", 200));
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("conflictResolutionRequests")
  @DisplayName("TC-94: PUT /api/customers/{id}/status reactivates once the conflicting phone number is resolved")
  void reactivateSucceedsAfterConflictIsResolved(String path, String json, String expectedPhone) throws Exception {
    assertEquals(201, post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0912345678\"}").statusCode());
    assertEquals(200, put("/2/status", "{\"status\":\"INACTIVE\"}").statusCode());
    assertEquals(201, post("{\"name\":\"Le Van Cuong\",\"email\":\"cuong@example.com\",\"phone\":\"0912345678\"}").statusCode());
    assertEquals(400, put("/2/status", "{\"status\":\"ACTIVE\"}").statusCode());

    HttpResponse<String> resolve = put(path, json);
    assertEquals(200, resolve.statusCode());

    HttpResponse<String> response = put("/2/status", "{\"status\":\"ACTIVE\"}");

    assertEquals(200, response.statusCode());
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals(2, body.get("id").asLong());
    assertEquals("ACTIVE", body.get("status").asText());
    assertEquals("Tran Thi Binh", body.get("name").asText());
    if (expectedPhone == null) {
      assertTrue(body.get("phone").isNull());
    } else {
      assertEquals(expectedPhone, body.get("phone").asText());
    }

    JsonNode fetched = CustomerHandler.JSON.readTree(get("/2").body());
    assertEquals(body, fetched);
    assertEquals(3, customers().size());
  }

  private static Stream<Arguments> conflictResolutionRequests() {
    return Stream.of(
        Arguments.of("/3", "{\"name\":\"Le Van Cuong\",\"email\":\"cuong@example.com\",\"phone\":\"0987654321\"}", "0912345678"),
        Arguments.of("/3", "{\"name\":\"Le Van Cuong\",\"email\":\"cuong@example.com\"}", "0912345678"),
        Arguments.of("/3/status", "{\"status\":\"INACTIVE\"}", "0912345678"),
        Arguments.of("/2", "{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0987654321\"}", "0987654321"),
        Arguments.of("/2", "{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\"}", null));
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("sameStatusRequests")
  @DisplayName("TC-95: PUT /api/customers/{id}/status to the status already held returns 200 and changes nothing, even when repeated")
  void setSameStatusTwiceReturns200AndChangesNothing(long id, String body) throws Exception {
    assertEquals(201, post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0912345678\"}").statusCode());
    assertEquals(200, put("/2/status", "{\"status\":\"INACTIVE\"}").statusCode());
    assertEquals(201, post("{\"name\":\"Le Van Cuong\",\"email\":\"cuong@example.com\",\"phone\":\"0912345678\"}").statusCode());
    JsonNode before = customers();
    JsonNode expected = before.get((int) id - 1);

    for (int i = 0; i < 2; i++) {
      HttpResponse<String> response = put("/" + id + "/status", body);
      assertEquals(200, response.statusCode());
      assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/json"));
      assertEquals(expected, CustomerHandler.JSON.readTree(response.body()));
    }
    assertEquals(before, customers());
  }

  private static Stream<Arguments> sameStatusRequests() {
    return Stream.of(
        Arguments.of(1L, "{\"status\":\"ACTIVE\"}"),
        Arguments.of(3L, "{\"status\":\"ACTIVE\"}"),
        Arguments.of(2L, "{\"status\":\"INACTIVE\"}"));
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("unknownIdStatusBodies")
  @DisplayName("TC-96: PUT /api/customers/{id}/status for an unknown id returns 404 even when status is invalid")
  void unknownIdReturns404EvenWhenStatusIsInvalid(long id, String body) throws Exception {
    JsonNode before = customers();

    HttpResponse<String> response = put("/" + id + "/status", body);

    assertEquals(404, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode responseBody = CustomerHandler.JSON.readTree(response.body());
    assertEquals("Not Found", responseBody.get("title").asText());
    assertEquals("Customer " + id + " not found", responseBody.get("detail").asText());
    assertFalse(responseBody.has("errors"));
    assertEquals(before, customers());
  }

  private static Stream<Arguments> unknownIdStatusBodies() {
    return Stream.of(
        Arguments.of(999L, "{\"status\":\"ACTIVE\"}"),
        Arguments.of(999L, "{\"status\":\"INACTIVE\"}"),
        Arguments.of(999L, "{\"status\":\"DELETED\"}"),
        Arguments.of(999L, "{}"),
        Arguments.of(0L, "{\"status\":\"INACTIVE\"}"),
        Arguments.of(2L, "{\"status\":\"INACTIVE\"}"));
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("invalidTargetStatusBodies")
  @DisplayName("TC-97: PUT /api/customers/{id}/status with an invalid target status returns 400 with errors.status")
  void invalidTargetStatusReturns400(String body) throws Exception {
    JsonNode before = customers();

    HttpResponse<String> response = put("/1/status", body);

    assertEquals(400, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode responseBody = CustomerHandler.JSON.readTree(response.body());
    assertEquals("Validation failed", responseBody.get("title").asText());
    assertEquals(Map.of("status", "must be ACTIVE or INACTIVE"), errorsOf(responseBody));
    assertEquals(before, customers());
  }

  private static Stream<String> invalidTargetStatusBodies() {
    return Stream.of(
        "{}",
        "{\"state\":\"INACTIVE\"}",
        "{\"status\":null}",
        "{\"status\":\"\"}",
        "{\"status\":\"DELETED\"}",
        "{\"status\":\"active\"}",
        "{\"status\":\"inactive\"}",
        "{\"status\":\" INACTIVE \"}");
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("malformedStatusPaths")
  @DisplayName("TC-98: PUT /api/customers/{id}/status with a body that is not valid JSON returns 400 Malformed JSON before the lookup")
  void malformedJsonReturns400BeforeLookup(String path) throws Exception {
    JsonNode before = customers();

    HttpResponse<String> response = put(path, "{\"status\":");

    assertEquals(400, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals("Malformed JSON", body.get("title").asText());
    assertEquals("The request body is not valid JSON", body.get("detail").asText());
    assertFalse(body.has("errors"));
    assertEquals(before, customers());
  }

  private static Stream<String> malformedStatusPaths() {
    return Stream.of("/1/status", "/999/status");
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("unroutedStatusPaths")
  @DisplayName("TC-99: PUT on a path that does not match /api/customers/{digits}/status returns the 404 fallback")
  void putOnUnroutedStatusPathReturnsFallback(String path, String detail) throws Exception {
    JsonNode before = customers();

    HttpResponse<String> response = put(path, "{\"status\":\"INACTIVE\"}");

    assertEquals(404, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals("Not Found", body.get("title").asText());
    assertEquals(detail, body.get("detail").asText());
    assertEquals(before, customers());
  }

  private static Stream<Arguments> unroutedStatusPaths() {
    return Stream.of(
        Arguments.of("/abc/status", "No route for PUT /api/customers/abc/status"),
        Arguments.of("/-1/status", "No route for PUT /api/customers/-1/status"),
        Arguments.of("/status", "No route for PUT /api/customers/status"),
        Arguments.of("/1/status/x", "No route for PUT /api/customers/1/status/x"),
        Arguments.of("/1/statuses", "No route for PUT /api/customers/1/statuses"));
  }

  @Test
  @DisplayName("TC-100: GET /api/customers/{id}/status returns the 404 fallback and GET /api/customers/{id} still works")
  void getOnStatusPathReturnsFallbackAndGetByIdStillWorks() throws Exception {
    HttpResponse<String> statusResponse = get("/1/status");

    assertEquals(404, statusResponse.statusCode());
    assertTrue(statusResponse.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode statusBody = CustomerHandler.JSON.readTree(statusResponse.body());
    assertEquals("Not Found", statusBody.get("title").asText());
    assertEquals("No route for GET /api/customers/1/status", statusBody.get("detail").asText());

    HttpResponse<String> byIdResponse = get("/1");

    assertEquals(200, byIdResponse.statusCode());
    JsonNode byIdBody = CustomerHandler.JSON.readTree(byIdResponse.body());
    assertEquals(1, byIdBody.get("id").asLong());
    assertEquals("ACTIVE", byIdBody.get("status").asText());
  }

  /** Builds the standard four-customer store (1 ACTIVE, 2 INACTIVE, 3 ACTIVE, 4 INACTIVE) on top of seed customer 1. */
  private void insertStandardFour() throws Exception {
    assertEquals(201, post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0912345678\"}").statusCode());
    assertEquals(201, post("{\"name\":\"Le Van Cuong\",\"email\":\"cuong@example.com\",\"phone\":\"0987654321\"}").statusCode());
    assertEquals(201, post("{\"name\":\"Pham Thi Dung\",\"email\":\"dung@example.com\"}").statusCode());
    assertEquals(200, put("/2/status", "{\"status\":\"INACTIVE\"}").statusCode());
    assertEquals(200, put("/4/status", "{\"status\":\"INACTIVE\"}").statusCode());
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("statusFilterPathsAndIds")
  @DisplayName("TC-120: GET /api/customers returns 200 with exactly the customers matching the status query parameter")
  void listFiltersByStatusQueryParameter(String path, List<Long> expectedIds, String expectedFilterStatus) throws Exception {
    insertStandardFour();
    JsonNode all = customers();
    assertEquals(4, all.size());

    HttpResponse<String> response = get(path);

    assertEquals(200, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertEquals(expectedIds.size(), body.size());
    for (int i = 0; i < expectedIds.size(); i++) {
      long id = expectedIds.get(i);
      assertEquals(id, body.get(i).get("id").asLong());
      assertEquals(all.get((int) id - 1), body.get(i));
      if (expectedFilterStatus != null) {
        assertEquals(expectedFilterStatus, body.get(i).get("status").asText());
      }
    }
  }

  private static Stream<Arguments> statusFilterPathsAndIds() {
    return Stream.of(
        Arguments.of("", List.of(1L, 2L, 3L, 4L), null),
        Arguments.of("?status=ACTIVE", List.of(1L, 3L), "ACTIVE"),
        Arguments.of("?status=INACTIVE", List.of(2L, 4L), "INACTIVE"),
        Arguments.of("?status=ACTIVE&foo=1", List.of(1L, 3L), "ACTIVE"),
        Arguments.of("?foo=1&status=ACTIVE", List.of(1L, 3L), "ACTIVE"),
        Arguments.of("?status=%41CTIVE", List.of(1L, 3L), "ACTIVE"),
        Arguments.of("?%73tatus=INACTIVE", List.of(2L, 4L), "INACTIVE"),
        Arguments.of("?", List.of(1L, 2L, 3L, 4L), null),
        Arguments.of("?foo=1", List.of(1L, 2L, 3L, 4L), null),
        Arguments.of("?Status=ACTIVE", List.of(1L, 2L, 3L, 4L), null),
        Arguments.of("?STATUS=ACTIVE", List.of(1L, 2L, 3L, 4L), null),
        Arguments.of("?state=ACTIVE", List.of(1L, 2L, 3L, 4L), null),
        Arguments.of("?xstatus=INACTIVE", List.of(1L, 2L, 3L, 4L), null),
        Arguments.of("?foo=1%26status%3DACTIVE", List.of(1L, 2L, 3L, 4L), null),
        Arguments.of("?status%3DACTIVE", List.of(1L, 2L, 3L, 4L), null));
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("noMatchStatusScenarios")
  @DisplayName("TC-121: GET /api/customers with a valid status that no customer has returns 200 with an empty array")
  void listWithValidStatusAndNoMatchReturnsEmptyArray(List<Long> idsToDeactivateFirst, String path) throws Exception {
    assertEquals(201, post("{\"name\":\"Tran Thi Binh\",\"email\":\"binh@example.com\",\"phone\":\"0912345678\"}").statusCode());
    for (long id : idsToDeactivateFirst) {
      assertEquals(200, put("/" + id + "/status", "{\"status\":\"INACTIVE\"}").statusCode());
    }

    HttpResponse<String> response = get(path);

    assertEquals(200, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertTrue(body.isArray());
    assertEquals(0, body.size());
    assertEquals(2, customers().size());
  }

  private static Stream<Arguments> noMatchStatusScenarios() {
    return Stream.of(
        Arguments.of(List.of(), "?status=INACTIVE"),
        Arguments.of(List.of(1L, 2L), "?status=ACTIVE"));
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("statusChangeScenarios")
  @DisplayName("TC-122: GET /api/customers filters by the status currently stored after a status change")
  void listFiltersByCurrentlyStoredStatusAfterChange(
      long changedId, String changeBody, List<Long> expectedActiveIds, List<Long> expectedInactiveIds)
      throws Exception {
    insertStandardFour();
    JsonNode all = customers();

    HttpResponse<String> changed = put("/" + changedId + "/status", changeBody);
    assertEquals(200, changed.statusCode());

    HttpResponse<String> activeResponse = get("?status=ACTIVE");
    HttpResponse<String> inactiveResponse = get("?status=INACTIVE");

    assertEquals(200, activeResponse.statusCode());
    assertEquals(200, inactiveResponse.statusCode());
    JsonNode activeBody = CustomerHandler.JSON.readTree(activeResponse.body());
    JsonNode inactiveBody = CustomerHandler.JSON.readTree(inactiveResponse.body());
    assertEquals(expectedActiveIds.size(), activeBody.size());
    for (int i = 0; i < expectedActiveIds.size(); i++) {
      long id = expectedActiveIds.get(i);
      assertEquals(id, activeBody.get(i).get("id").asLong());
      if (id == changedId) {
        assertEquals("ACTIVE", activeBody.get(i).get("status").asText());
      } else {
        assertEquals(all.get((int) id - 1), activeBody.get(i));
      }
    }
    assertEquals(expectedInactiveIds.size(), inactiveBody.size());
    for (int i = 0; i < expectedInactiveIds.size(); i++) {
      long id = expectedInactiveIds.get(i);
      assertEquals(id, inactiveBody.get(i).get("id").asLong());
      if (id == changedId) {
        assertEquals("INACTIVE", inactiveBody.get(i).get("status").asText());
      } else {
        assertEquals(all.get((int) id - 1), inactiveBody.get(i));
      }
    }
  }

  private static Stream<Arguments> statusChangeScenarios() {
    return Stream.of(
        Arguments.of(1L, "{\"status\":\"INACTIVE\"}", List.of(3L), List.of(1L, 2L, 4L)),
        Arguments.of(2L, "{\"status\":\"ACTIVE\"}", List.of(1L, 2L, 3L), List.of(4L)));
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("invalidStatusFilterPaths")
  @DisplayName("TC-123: GET /api/customers with an invalid status query parameter returns 400 with errors.status")
  void listWithInvalidStatusReturnsProblem(String path) throws Exception {
    JsonNode before = customers();

    HttpResponse<String> response = get(path);

    assertEquals(400, response.statusCode());
    assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/problem+json"));
    JsonNode body = CustomerHandler.JSON.readTree(response.body());
    assertTrue(body.isObject());
    assertEquals("about:blank", body.get("type").asText());
    assertEquals("Validation failed", body.get("title").asText());
    assertEquals(400, body.get("status").asInt());
    assertEquals("The request has invalid fields", body.get("detail").asText());
    assertEquals(Map.of("status", "must be ACTIVE or INACTIVE"), errorsOf(body));
    assertEquals(before, customers());
  }

  private static Stream<String> invalidStatusFilterPaths() {
    return Stream.of(
        "?status=DELETED",
        "?status=ALL",
        "?status=active",
        "?status=Inactive",
        "?status=",
        "?status",
        "?status=%20ACTIVE",
        "?status=INACTIVE%20",
        "?status=+ACTIVE",
        "?status=ACTIVE,INACTIVE",
        "?status=ACTIVE&status=INACTIVE",
        "?status=ACTIVE&status=ACTIVE",
        "?status=ACTIVE&status=",
        "?foo=1&status=DELETED",
        "?status=ACTIVE%26foo%3D1",
        "?status=ACTIVE=1");
  }

  @ParameterizedTest(name = "[{index}]")
  @MethodSource("statusQueryOnOtherRoutes")
  @DisplayName("TC-124: routes other than GET /api/customers ignore the status query parameter")
  void otherRoutesIgnoreStatusQueryParameter(
      String method, String path, String body, int expectedStatus, String fieldName, String expectedValue)
      throws Exception {
    HttpResponse<String> response = method.equals("GET") ? get(path) : put(path, body);

    assertEquals(expectedStatus, response.statusCode());
    JsonNode responseBody = CustomerHandler.JSON.readTree(response.body());
    assertFalse(responseBody.has("errors"));
    if (fieldName != null) {
      assertEquals(expectedValue, responseBody.get(fieldName).asText());
    }
  }

  private static Stream<Arguments> statusQueryOnOtherRoutes() {
    return Stream.of(
        Arguments.of("GET", "/1?status=DELETED", null, 200, "email", "an@example.com"),
        Arguments.of("GET", "/999?status=DELETED", null, 404, "detail", "Customer 999 not found"),
        Arguments.of(
            "PUT",
            "/1?status=DELETED",
            "{\"name\":\"Nguyen Van Anh\",\"email\":\"an@example.com\"}",
            200,
            "name",
            "Nguyen Van Anh"),
        Arguments.of(
            "PUT", "/1/status?status=DELETED", "{\"status\":\"INACTIVE\"}", 200, "status", "INACTIVE"));
  }
}
