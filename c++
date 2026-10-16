
#include <WiFi.h>
#include <WebServer.h>

// Replace with your Wi-Fi network credentials.
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Example HC-SR04 wiring.
const int TRIG_PIN = 5;
const int ECHO_PIN = 18;

WebServer server(80);

// CALIBRATE THESE FOR YOUR OWN TANK.
// Distance from sensor to water when the tank is empty.
const float EMPTY_DISTANCE_CM = 100.0;

// Distance from sensor to water when the tank is full.
const float FULL_DISTANCE_CM = 10.0;

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(3);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // Stop waiting after 30 ms if no echo is received.
  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    return -1.0;
  }

  // Sound travels to the surface and back.
  return duration * 0.0343f / 2.0f;
}

void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");
}

void handleStatus() {
  float distance = readDistanceCm();

  sendCorsHeaders();
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");

  if (
    distance < 0 ||
    distance > EMPTY_DISTANCE_CM + 20 ||
    distance < FULL_DISTANCE_CM - 10
  ) {
    server.send(200, "application/json",
      "{\"sensorOk\":false,\"error\":\"No valid echo or outside calibrated range\"}");
    return;
  }

  float level =
    (EMPTY_DISTANCE_CM - distance) /
    (EMPTY_DISTANCE_CM - FULL_DISTANCE_CM) * 100.0f;

  level = constrain(level, 0.0f, 100.0f);

  String json = "{";
  json += "\"sensorOk\":true,";
  json += "\"levelPercent\":" + String(level, 1) + ",";
  json += "\"distanceCm\":" + String(distance, 1);
  json += "}";

  server.send(200, "application/json", json);
}

void handleOptions() {
  sendCorsHeaders();
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.send(204);
}

void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to Wi-Fi");

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nWi-Fi connection failed.");
    Serial.println("Check credentials and restart the ESP32.");
    return;
  }

  Serial.println("\nWi-Fi connected.");
  Serial.print("ESP32 IP address: ");
  Serial.println(WiFi.localIP());

  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/status", HTTP_OPTIONS, handleOptions);

  server.on("/", HTTP_GET, []() {
    sendCorsHeaders();
    server.send(200, "text/plain",
      "Rain2Root ESP32 is running. Visit /api/status for sensor data.");
  });

  server.begin();
  Serial.println("Rain2Root API server started.");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    server.handleClient();
  }
}
