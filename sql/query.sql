USE ca_vehicle;
SELECT * FROM County;
SELECT * FROM zip ORDER BY zip_code limit 20000;
SELECT 
    Z.zip_code,
    Z.county_id,
    C.county_name
FROM 
    ZIP Z
JOIN 
    County C ON Z.county_id = C.county_id LIMIT 20000;
SELECT * FROM fuelType;

SELECT DISTINCT vr.zip_code
FROM vehicle_record AS vr
LEFT JOIN zip AS z ON vr.zip_code = z.zip_code
WHERE z.zip_code IS NULL;
SELECT * FROM chargingStationRecord order by report_year;