CREATE DATABASE IF NOT EXISTS schedwise
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE schedwise;

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  status ENUM('pending', 'active', 'suspended', 'disabled') NOT NULL DEFAULT 'pending',
  faculty_approval_status ENUM('not_required', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'not_required',
  email_verified_at TIMESTAMP NULL,
  last_login_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- User profiles table
CREATE TABLE IF NOT EXISTS account_id_sequences (
  role_id VARCHAR(32) PRIMARY KEY,
  next_number INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id VARCHAR(64) PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  student_number VARCHAR(100) NULL UNIQUE,
  faculty_number VARCHAR(100) NULL UNIQUE,
  department_id VARCHAR(64) NULL,
  program VARCHAR(255) NULL,
  phone VARCHAR(20) NULL,
  avatar_path VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Departments table
CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  college VARCHAR(255) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Faculty availability (recurring weekly)
CREATE TABLE IF NOT EXISTS faculty_availability (
  id VARCHAR(64) PRIMARY KEY,
  faculty_id VARCHAR(64) NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
  start_minutes SMALLINT UNSIGNED NOT NULL, -- minutes from 00:00
  end_minutes SMALLINT UNSIGNED NOT NULL, -- minutes from 00:00
  location VARCHAR(255) NULL,
  meeting_link VARCHAR(500) NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY faculty_weekday_time (faculty_id, weekday, start_minutes, end_minutes)
) ENGINE=InnoDB;

-- Schedule overrides (date-specific availability or blocks)
CREATE TABLE IF NOT EXISTS schedule_overrides (
  id VARCHAR(64) PRIMARY KEY,
  faculty_id VARCHAR(64) NOT NULL,
  date DATE NOT NULL,
  kind ENUM('available', 'blocked') NOT NULL,
  start_minutes SMALLINT UNSIGNED NULL,
  end_minutes SMALLINT UNSIGNED NULL,
  location VARCHAR(255) NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Appointments table (updated with relational fields)
CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(64) PRIMARY KEY,
  student_id VARCHAR(64) NOT NULL,
  faculty_id VARCHAR(64) NOT NULL,
  availability_id VARCHAR(64) NULL,
  appointment_date DATE NOT NULL,
  start_minutes SMALLINT UNSIGNED NOT NULL,
  end_minutes SMALLINT UNSIGNED NOT NULL,
  topic VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  location VARCHAR(255) NULL,
  meeting_link VARCHAR(500) NULL,
  status ENUM('pending', 'confirmed', 'rejected', 'reschedule_requested', 'cancelled', 'completed', 'no_show') NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  cancelled_at TIMESTAMP NULL,
  cancelled_by VARCHAR(64) NULL, -- user_id who cancelled
  cancellation_reason TEXT NULL,
  reschedule_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (availability_id) REFERENCES faculty_availability(id) ON DELETE SET NULL,
  INDEX appointments_date_idx (appointment_date, start_minutes),
  INDEX appointments_faculty_idx (faculty_id),
  INDEX appointments_student_idx (student_id),
  INDEX appointments_status_idx (status)
) ENGINE=InnoDB;

-- Consultation records
CREATE TABLE IF NOT EXISTS consultation_records (
  id VARCHAR(64) PRIMARY KEY,
  appointment_id VARCHAR(64) NOT NULL,
  faculty_id VARCHAR(64) NOT NULL,
  student_id VARCHAR(64) NOT NULL,
  summary TEXT NULL, -- visible to student
  action_items TEXT NULL, -- visible to student
  private_notes TEXT NULL, -- faculty only
  follow_up_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(50) NOT NULL, -- e.g., 'appointment_approved', 'appointment_cancelled', etc.
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  related_appointment_id VARCHAR(64) NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (related_appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor_user_id VARCHAR(64) NULL, -- NULL for failed logins before authentication
  action VARCHAR(100) NOT NULL, -- e.g., 'create', 'update', 'delete', 'login', etc.
  entity_type VARCHAR(50) NULL, -- e.g., 'user', 'appointment', etc.
  entity_id VARCHAR(64) NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX audit_logs_created_idx (created_at),
  INDEX audit_logs_action_idx (action),
  INDEX audit_logs_entity_idx (entity_type)
) ENGINE=InnoDB;

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX password_resets_user_idx (user_id),
  INDEX password_resets_expires_idx (expires_at)
) ENGINE=InnoDB;

-- Hashed, expiring, single-use email verification links
CREATE TABLE IF NOT EXISTS email_verifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY email_verifications_token (token_hash),
  INDEX email_verifications_user_idx (user_id),
  INDEX email_verifications_expires_idx (expires_at)
) ENGINE=InnoDB;

-- Login / registration / password-reset throttling
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bucket VARCHAR(50) NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX rate_limits_lookup_idx (bucket, identifier, attempted_at)
) ENGINE=InnoDB;

-- Insert default roles
INSERT IGNORE INTO roles (id, name, description) VALUES
  ('student', 'Student', 'Student role'),
  ('faculty', 'Faculty', 'Faculty role'),
  ('admin', 'Administrator', 'Administrator role');

-- Demo departments (IDs match the frontend registration mapping)
INSERT IGNORE INTO departments (id, name, college, status) VALUES
  ('ccs', 'College of Computer Studies', 'College of Computer Studies', 'active'),
  ('coe', 'College of Engineering', 'College of Engineering', 'active'),
  ('cba', 'College of Business', 'College of Business', 'active'),
  ('cas', 'College of Arts & Sciences', 'College of Arts & Sciences', 'active');

-- Demo accounts. Change these passwords if the project is shared or exposed.
-- admin@schedwise.edu    / Admin123!
-- elena.cruz@schedwise.edu / Passw0rd!
-- juan.delacruz@schedwise.edu / Passw0rd!
INSERT IGNORE INTO users (id, email, password_hash, role_id, status, email_verified_at, last_login_at)
VALUES
  ('admin001', 'admin@schedwise.edu', '$2y$10$97dWxXXw/l4qnZ2LyJh3ouQ3yrNLs8NRZxGoAht1rcjpelRN4lyDO', 'admin', 'active', NOW(), NULL),
  ('faculty001', 'elena.cruz@schedwise.edu', '$2y$10$e4h3Ff61UrW8zkLjI3Kb1eXyTPGfHeAezWojmMvBhBW2Zv4iRkoHa', 'faculty', 'active', NOW(), NULL),
  ('student001', 'juan.delacruz@schedwise.edu', '$2y$10$fJDbpfTB.4PNuAaSm8iEZO2DSoug42bJwPsDHrMLgq5dZo2cPWOiS', 'student', 'active', NOW(), NULL);

INSERT IGNORE INTO user_profiles
  (user_id, first_name, last_name, student_number, faculty_number, department_id, program, phone)
VALUES
  ('admin001', 'System', 'Administrator', NULL, NULL, NULL, NULL, NULL),
  ('faculty001', 'Elena', 'Cruz', NULL, 'FAC-0001', 'ccs', NULL, NULL),
  ('student001', 'Juan', 'Dela Cruz', 'STU-0001', NULL, 'ccs', 'BS Computer Science', NULL);

-- Weekday availability: Monday-Friday, 09:00-12:00 and 13:00-16:00.
INSERT IGNORE INTO faculty_availability
  (id, faculty_id, weekday, start_minutes, end_minutes, location, timezone, active)
VALUES
  ('avail-mon-am', 'faculty001', 1, 540, 720, 'Faculty Office', 'Asia/Manila', TRUE),
  ('avail-mon-pm', 'faculty001', 1, 780, 960, 'Faculty Office', 'Asia/Manila', TRUE),
  ('avail-tue-am', 'faculty001', 2, 540, 720, 'Faculty Office', 'Asia/Manila', TRUE),
  ('avail-tue-pm', 'faculty001', 2, 780, 960, 'Faculty Office', 'Asia/Manila', TRUE),
  ('avail-wed-am', 'faculty001', 3, 540, 720, 'Faculty Office', 'Asia/Manila', TRUE),
  ('avail-wed-pm', 'faculty001', 3, 780, 960, 'Faculty Office', 'Asia/Manila', TRUE),
  ('avail-thu-am', 'faculty001', 4, 540, 720, 'Faculty Office', 'Asia/Manila', TRUE),
  ('avail-thu-pm', 'faculty001', 4, 780, 960, 'Faculty Office', 'Asia/Manila', TRUE),
  ('avail-fri-am', 'faculty001', 5, 540, 720, 'Faculty Office', 'Asia/Manila', TRUE),
  ('avail-fri-pm', 'faculty001', 5, 780, 960, 'Faculty Office', 'Asia/Manila', TRUE);
