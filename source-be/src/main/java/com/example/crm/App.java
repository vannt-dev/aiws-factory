package com.example.crm;

import com.example.crm.api.CustomerHandler;
import com.example.crm.repository.InMemoryCustomerRepository;
import com.example.crm.service.CustomerService;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;

/** Starts the CRM API. Port from the PORT environment variable, default 8080. */
public final class App {
  private App() {}

  public static HttpServer start(int port, CustomerService service) throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
    server.createContext("/api/customers", new CustomerHandler(service));
    server.start();
    return server;
  }

  public static void main(String[] args) throws IOException {
    int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
    CustomerService service = new CustomerService(new InMemoryCustomerRepository());
    service.create("Nguyen Van An", "an.nguyen@example.com", null);
    service.create("Tran Thi Binh", "binh.tran@example.com", null);
    HttpServer server = start(port, service);
    System.out.println("CRM API listening on http://localhost:" + server.getAddress().getPort());
  }
}
