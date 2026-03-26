USE ca_vehicle;
# ----------Q1------------
SELECT 
    c.county_name,
    SUM(vr.vehicle_count) AS ev_count,
    RANK() OVER (ORDER BY SUM(vr.vehicle_count) DESC) AS ev_rank
FROM VehicleRecord vr
JOIN FuelType ft ON vr.fuel_type_id = ft.fuel_type_id
JOIN ZIP z ON vr.zip_code = z.zip_code
JOIN County c ON z.county_id = c.county_id
WHERE ft.fuel_type = 'Battery Electric'
GROUP BY c.county_name
ORDER BY ev_count DESC LIMIT 5;

# ----------Q2------------   
SELECT
    model_year,
    gas_count,
    ev_count,
    ROUND(gas_count / NULLIF(ev_count, 0), 2) AS gas_to_ev_ratio
FROM (
    SELECT
        vr.model_year ,
        SUM(CASE WHEN ft.fuel_type = 'Gasoline' THEN vr.vehicle_count ELSE 0 END) AS gas_count,
        SUM(CASE WHEN ft.fuel_type = 'Battery Electric' THEN vr.vehicle_count ELSE 0 END) AS ev_count
    FROM VehicleRecord vr
    JOIN FuelType ft ON vr.fuel_type_id = ft.fuel_type_id
    GROUP BY vr.model_year
) AS counts
ORDER BY model_year;

# ----------Q3------------   
SELECT
    model_year,
    total_vehicle_count,
    ROUND(gas_count / total_vehicle_count * 100, 2) AS gas_pct,
    ROUND(diesel_count / total_vehicle_count * 100, 2) AS diesel_pct,
    ROUND(ev_count / total_vehicle_count * 100, 2) AS ev_pct,
    ROUND(hybrid_count / total_vehicle_count * 100, 2) AS hybrid_pct
FROM (
    SELECT
        vr.model_year,
        SUM(vr.vehicle_count) AS total_vehicle_count,
        SUM(CASE WHEN ft.fuel_type = 'Gasoline' THEN vr.vehicle_count ELSE 0 END) AS gas_count,
        SUM(CASE WHEN ft.fuel_type = 'Diesel and Diesel Hybrid' THEN vr.vehicle_count ELSE 0 END) AS diesel_count,
        SUM(CASE WHEN ft.fuel_type = 'Battery Electric' THEN vr.vehicle_count ELSE 0 END) AS ev_count,
        SUM(CASE WHEN ft.fuel_type IN ('Plug-in Hybrid', 'Hybrid Gasoline') THEN vr.vehicle_count ELSE 0 END) AS hybrid_count
    FROM VehicleRecord vr
    JOIN FuelType ft ON vr.fuel_type_id = ft.fuel_type_id
    GROUP BY vr.model_year
) AS counts
ORDER BY model_year;


#----------Q4------------   
WITH 
  TopEVCounty AS (
    SELECT 
        c.county_id,
        c.county_name,
        RANK() OVER (ORDER BY SUM(vr.vehicle_count) DESC) AS ev_rank
    FROM VehicleRecord vr
    JOIN FuelType ft ON vr.fuel_type_id = ft.fuel_type_id
    JOIN ZIP z  ON vr.zip_code = z.zip_code
    JOIN County c  ON z.county_id = c.county_id
    WHERE ft.fuel_type = 'Battery Electric'
    GROUP BY c.county_id, c.county_name
    LIMIT 5
  ),
  GasGrowth AS (
    SELECT
        gr.county_id,
        gr.report_year,
        gr.gas_station_count,
        LAG(gr.gas_station_count) 
        OVER (PARTITION BY gr.county_id ORDER BY gr.report_year) 
        AS prev_gas_count
    FROM GasStationRecord AS gr
    JOIN TopEVCounty AS te ON gr.county_id = te.county_id
  ),
  ChargeGrowth AS (
    SELECT
      cr.county_id,
      cr.report_year,
      cr.charging_station_count,
      LAG(cr.charging_station_count) 
      OVER (PARTITION BY cr.county_id ORDER BY cr.report_year) 
      AS prev_charge_count
    FROM ChargingStationRecord AS cr
    JOIN TopEVCounty AS te ON cr.county_id = te.county_id
  )
  SELECT
    te.ev_rank AS ev_rank,
    te.county_name AS county,
    gg.report_year AS report_year,
    gg.gas_station_count AS gas_station_count,
    gg.prev_gas_count AS prev_gas_count,
    ROUND(
      100 * (gg.gas_station_count - gg.prev_gas_count)
          / NULLIF(gg.prev_gas_count,0),
      2
    ) AS gas_change,
    cg.charging_station_count AS ev_chargers,
    cg.prev_charge_count AS prev_ev_chargers,
    ROUND(
      100 * (cg.charging_station_count - cg.prev_charge_count)
          / NULLIF(cg.prev_charge_count,0),
      2
    ) AS charger_change
  FROM GasGrowth AS gg
  JOIN ChargeGrowth AS cg ON gg.county_id = cg.county_id  
  AND gg.report_year = cg.report_year
  JOIN TopEVCounty AS te ON gg.county_id = te.county_id
  ORDER BY te.ev_rank, gg.report_year;
#----------Q5------------   
WITH TopEVCountries AS (
    SELECT 
        c.county_id,
        c.county_name,
        RANK() OVER (ORDER BY SUM(vr.vehicle_count) DESC) AS ev_rank
    FROM VehicleRecord vr
    JOIN FuelType ft ON vr.fuel_type_id = ft.fuel_type_id
    JOIN ZIP z ON vr.zip_code = z.zip_code
    JOIN County c ON z.county_id = c.county_id
    WHERE ft.fuel_type = 'Battery Electric'
    GROUP BY c.county_id, c.county_name
    ORDER BY ev_rank
    LIMIT 5
),
FuelSalesWithLag AS (
    SELECT 
        te.ev_rank,
        c.county_name,
        gr.report_year,
        gr.gasoline_sales,
        LAG(gr.gasoline_sales) OVER (PARTITION BY gr.county_id ORDER BY gr.report_year) AS prev_gasoline_sales,
        gr.diesel_sales,
        LAG(gr.diesel_sales) OVER (PARTITION BY gr.county_id ORDER BY gr.report_year) AS prev_diesel_sales
    FROM GasStationRecord gr
    JOIN TopEVCountries te ON gr.county_id = te.county_id
    JOIN County c ON gr.county_id = c.county_id
)
SELECT 
    ev_rank,
    county_name,
    report_year,
    gasoline_sales,
    prev_gasoline_sales,
    ROUND((gasoline_sales - prev_gasoline_sales) / NULLIF(prev_gasoline_sales, 0) * 100, 2) AS gas_change_pct,
    diesel_sales,
    prev_diesel_sales,
    ROUND((diesel_sales - prev_diesel_sales) / NULLIF(prev_diesel_sales, 0) * 100, 2) AS diesel_change_pct
FROM FuelSalesWithLag
ORDER BY ev_rank, report_year;

