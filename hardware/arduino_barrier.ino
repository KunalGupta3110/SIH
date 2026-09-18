#include <Arduino.h>

/*
  IBVAP Cyber Camera Surveillance - Physical Checkpoint Barrier Interlock
  Platform: Arduino Uno / Nano / ESP32
  Wiring:
    - SG90 Micro Servo: Signal -> Pin 9, VCC -> 5V, GND -> GND
    - Active 5V Buzzer: Positive -> Pin 8, Negative -> GND
    - Red Strobe LED:   Anode (with 220 Ohm resistor) -> Pin 7, Cathode -> GND
*/

const int SERVO_PIN = 9;
const int BUZZER_PIN = 8;
const int LED_PIN = 7;

const int BARRIER_OPEN_ANGLE = 0;    // Barrier Up / Allowed
const int BARRIER_LOCKED_ANGLE = 90; // Barrier Down / Interlocked

bool isBreached = false;
bool servoPulseActive = false;
bool sirenActive = false;
int sirenPulsesRemaining = 0;
unsigned long servoFrameStartedMicros = 0;
unsigned long sirenChangedAtMillis = 0;
unsigned long ledChangedAtMillis = 0;
unsigned int servoPulseWidthMicros = 1000;
char serialCommand[32];
byte serialCommandLength = 0;

// Generate a servo pulse without requiring the external Servo library.
void setBarrierAngle(int angle) {
  angle = (angle < 0) ? 0 : ((angle > 180) ? 180 : angle);
  servoPulseWidthMicros = 1000U + (static_cast<unsigned long>(angle) * 1000U) / 180U;
}

void updateServo() {
  const unsigned long nowMicros = micros();

  if (servoPulseActive) {
    if (nowMicros - servoFrameStartedMicros >= servoPulseWidthMicros) {
      digitalWrite(SERVO_PIN, LOW);
      servoPulseActive = false;
    }
    return;
  }

  if (nowMicros - servoFrameStartedMicros >= 20000UL) {
    digitalWrite(SERVO_PIN, HIGH);
    servoPulseActive = true;
    servoFrameStartedMicros = nowMicros;
  }
}

void startSiren() {
  sirenActive = true;
  sirenPulsesRemaining = 3;
  sirenChangedAtMillis = millis();
  digitalWrite(BUZZER_PIN, HIGH);
}

void updateSiren() {
  if (!sirenActive) {
    return;
  }

  const unsigned long elapsed = millis() - sirenChangedAtMillis;
  const unsigned long duration = (digitalRead(BUZZER_PIN) == HIGH) ? 150UL : 100UL;
  if (elapsed < duration) {
    return;
  }

  sirenChangedAtMillis = millis();
  if (digitalRead(BUZZER_PIN) == HIGH) {
    digitalWrite(BUZZER_PIN, LOW);
    --sirenPulsesRemaining;
    return;
  }

  if (sirenPulsesRemaining > 0) {
    digitalWrite(BUZZER_PIN, HIGH);
  } else {
    sirenActive = false;
  }
}

void stopSiren() {
  sirenActive = false;
  sirenPulsesRemaining = 0;
  digitalWrite(BUZZER_PIN, LOW);
}

void updateBreachIndicator() {
  if (!isBreached) {
    digitalWrite(LED_PIN, LOW);
    return;
  }

  if (millis() - ledChangedAtMillis >= 200UL) {
    ledChangedAtMillis = millis();
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
  }
}

void handleCommand(const char *command) {
  if (strcmp(command, "B") == 0 || strcmp(command, "BOOM_LOCK_1") == 0 || strcmp(command, "BARRIER_DOWN") == 0 || strcmp(command, "RELAY_ON_1") == 0) {
    isBreached = true;
    setBarrierAngle(BARRIER_LOCKED_ANGLE);
    ledChangedAtMillis = millis();
    digitalWrite(LED_PIN, HIGH);
    startSiren();
    Serial.println("STATUS:BARRIER_INTERLOCKED");
  } else if (strcmp(command, "R") == 0 || strcmp(command, "BARRIER_UP") == 0) {
    isBreached = false;
    setBarrierAngle(BARRIER_OPEN_ANGLE);
    stopSiren();
    digitalWrite(LED_PIN, LOW);
    Serial.println("STATUS:BARRIER_RESET_OPEN");
  } else if (strcmp(command, "SIREN_OFF") == 0 || strcmp(command, "STROBE_OFF") == 0) {
    stopSiren();
    if (strcmp(command, "STROBE_OFF") == 0) {
      isBreached = false;
      digitalWrite(LED_PIN, LOW);
    }
    Serial.println("STATUS:SIREN_OFF");
  } else if (strcmp(command, "SIREN_ON") == 0 || strcmp(command, "STROBE_ON") == 0) {
    startSiren();
    if (strcmp(command, "STROBE_ON") == 0) {
      isBreached = true;
      digitalWrite(LED_PIN, HIGH);
    }
    Serial.println("STATUS:SIREN_ON");
  }
}

void setup() {
  Serial.begin(9600);
  
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
  pinMode(SERVO_PIN, OUTPUT);
  digitalWrite(SERVO_PIN, LOW);

  setBarrierAngle(BARRIER_OPEN_ANGLE); // Start in Open state
  servoFrameStartedMicros = micros() - 20000UL;

  Serial.println("IBVAP_HARDWARE_READY");
}

void loop() {
  while (Serial.available() > 0) {
    char incoming = Serial.read();
    if (incoming == '\n' || incoming == '\r') {
      if (serialCommandLength > 0) {
        serialCommand[serialCommandLength] = '\0';
        handleCommand(serialCommand);
        serialCommandLength = 0;
      }
    } else if (serialCommandLength < sizeof(serialCommand) - 1) {
      serialCommand[serialCommandLength++] = incoming;
    } else {
      serialCommandLength = 0;
    }
  }

  updateServo();
  updateSiren();
  updateBreachIndicator();
}
