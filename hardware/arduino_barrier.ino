/*
  IBVAP Cyber Camera Surveillance - Physical Checkpoint Barrier Interlock
  Platform: Arduino Uno / Nano / ESP32
  Wiring:
    - SG90 Micro Servo: Signal -> Pin 9, VCC -> 5V, GND -> GND
    - Active 5V Buzzer: Positive -> Pin 8, Negative -> GND
    - Red Strobe LED:   Anode (with 220 Ohm resistor) -> Pin 7, Cathode -> GND
*/

#include <Servo.h>

Servo barrierServo;

const int SERVO_PIN = 9;
const int BUZZER_PIN = 8;
const int LED_PIN = 7;

const int BARRIER_OPEN_ANGLE = 0;    // Barrier Up / Allowed
const int BARRIER_LOCKED_ANGLE = 90; // Barrier Down / Interlocked

bool isBreached = false;

void setup() {
  Serial.begin(9600);
  
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  barrierServo.attach(SERVO_PIN);
  barrierServo.write(BARRIER_OPEN_ANGLE); // Start in Open state

  Serial.println("IBVAP_HARDWARE_READY");
}

void loop() {
  if (Serial.available() > 0) {
    char cmd = Serial.read();

    // 'B' = Critical Breach Detected by Edge AI
    if (cmd == 'B' || cmd == 'b') {
      isBreached = true;
      barrierServo.write(BARRIER_LOCKED_ANGLE);
      digitalWrite(LED_PIN, HIGH);
      
      // Pulse Siren
      for (int i = 0; i < 3; i++) {
        digitalWrite(BUZZER_PIN, HIGH);
        delay(150);
        digitalWrite(BUZZER_PIN, LOW);
        delay(100);
      }
      Serial.println("STATUS:BARRIER_INTERLOCKED");
    }
    
    // 'R' = Operator Reset / Cleared
    else if (cmd == 'R' || cmd == 'r') {
      isBreached = false;
      barrierServo.write(BARRIER_OPEN_ANGLE);
      digitalWrite(BUZZER_PIN, LOW);
      digitalWrite(LED_PIN, LOW);
      Serial.println("STATUS:BARRIER_RESET_OPEN");
    }
  }

  // Blinking LED during active breach
  if (isBreached) {
    digitalWrite(LED_PIN, HIGH);
    delay(200);
    digitalWrite(LED_PIN, LOW);
    delay(200);
  }
}
