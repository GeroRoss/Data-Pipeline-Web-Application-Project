-- this file is for testing import data, it deletes all data leaving only table structure
-- clear any previous data to avoid duplicates
USE ca_vehicle;
DELETE FROM ChargingStationRecord;
DELETE FROM GasStationRecord;
DELETE FROM VehicleRecord;
ALTER TABLE VehicleRecord AUTO_INCREMENT = 1;
DELETE FROM FuelType;
ALTER TABLE FuelType AUTO_INCREMENT = 1;
DELETE FROM ModelYear;
DELETE FROM ReportYear;
DELETE FROM ZIP;
DELETE FROM County;
ALTER TABLE County AUTO_INCREMENT = 1;
