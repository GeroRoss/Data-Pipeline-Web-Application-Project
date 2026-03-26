DROP DATABASE IF EXISTS ca_vehicle;

CREATE DATABASE ca_vehicle;

USE ca_vehicle;

CREATE TABLE
    County (
        county_id TINYINT AUTO_INCREMENT NOT NULL PRIMARY KEY,
        county_name VARCHAR(100) NOT NULL
    );

CREATE TABLE
    ZIP (
        zip_code INT NOT NULL PRIMARY KEY,
        county_id TINYINT,
        FOREIGN KEY (county_id) REFERENCES County (county_id)
    );

CREATE TABLE
    ReportYear (report_year YEAR NOT NULL PRIMARY KEY);

CREATE TABLE
    ModelYear (model_year YEAR NOT NULL PRIMARY KEY);

CREATE TABLE
    FuelType (
        fuel_type_id TINYINT AUTO_INCREMENT NOT NULL PRIMARY KEY,
        fuel_type VARCHAR(255) NOT NULL
    );

CREATE TABLE
    VehicleRecord (
        record_id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
        model_year YEAR NOT NULL,
        zip_code INT NULL,
        fuel_type_id TINYINT NULL,
        vehicle_count INT NOT NULL,
        FOREIGN KEY (model_year) REFERENCES ModelYear (model_year),
        FOREIGN KEY (zip_code) REFERENCES ZIP (zip_code),
        FOREIGN KEY (fuel_type_id) REFERENCES FuelType (fuel_type_id)
    );

CREATE TABLE
    GasStationRecord (
        county_id TINYINT NOT NULL,
        report_year YEAR NOT NULL,
        gas_station_count INT NOT NULL,
        gasoline_sales DECIMAL(10, 2) NOT NULL,
        diesel_sales DECIMAL(10, 2) NOT NULL,
        PRIMARY KEY (county_id, report_year),
        FOREIGN KEY (county_id) REFERENCES County (county_id),
        FOREIGN KEY (report_year) REFERENCES ReportYear (report_year)
    );

CREATE TABLE
    ChargingStationRecord (
        county_id TINYINT NOT NULL,
        report_year YEAR NOT NULL,
        charging_station_count INT NOT NULL,
        PRIMARY KEY (county_id, report_year),
        FOREIGN KEY (county_id) REFERENCES County (county_id),
        FOREIGN KEY (report_year) REFERENCES ReportYear (report_year)
    );