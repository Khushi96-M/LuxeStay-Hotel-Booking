CREATE DATABASE IF NOT EXISTS hotel_booking;

USE hotel_booking;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    capacity INT NOT NULL DEFAULT 2,
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_code VARCHAR(30) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    room_id INT NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    guests INT NOT NULL DEFAULT 1,
    total_price DECIMAL(10,2) NOT NULL,
    status ENUM('Confirmed', 'Cancelled') NOT NULL DEFAULT 'Confirmed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

INSERT INTO rooms (room_name, description, price, capacity, image_url)
SELECT 'Deluxe Room', 'Elegant room with a comfortable king-size bed.', 2500, 2,
'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=900'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE room_name = 'Deluxe Room');

INSERT INTO rooms (room_name, description, price, capacity, image_url)
SELECT 'Luxury Suite', 'Spacious suite for a relaxing premium stay.', 4500, 4,
'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=900'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE room_name = 'Luxury Suite');

INSERT INTO rooms (room_name, description, price, capacity, image_url)
SELECT 'Standard Room', 'Comfortable room for a pleasant short stay.', 1800, 2,
'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=900'
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE room_name = 'Standard Room');
