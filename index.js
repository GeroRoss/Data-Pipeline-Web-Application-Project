const express = require("express");
const mustacheExpress = require("mustache-express");
const mysql = require("mysql2");
const app = express();
const port = 3000;

// View engine setup
app.engine("mustache", mustacheExpress());
app.set("view engine", "mustache");
app.set("views", __dirname + "/views");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true })); // built-in body parser

// Database connection
const db = mysql.createConnection({
  host: "127.0.0.1",
  user: "web_user",
  password: "password",
  database: "ca_vehicle",
});

// ----------------Routes-------------------
app.get("/", (req, res) => {
  // --- SQL setup ---
  const yearSql = "SELECT report_year FROM ReportYear ORDER BY report_year";
  const countySql = "SELECT county_name FROM County ORDER BY county_name";
  // --- Extract filters ---
  const selectedYear = req.query.year;
  const selectedCounty = req.query.county;

  let filters = [];
  let conditions = [];

  if (selectedYear) {
    conditions.push("ReportYear.report_year = ?");
    filters.push(selectedYear);
  }
  if (selectedCounty) {
    conditions.push("County.county_name = ?");
    filters.push(selectedCounty);
  }
  const whereClause =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  // --- Main data query ---
  const dataSql = `
  SELECT
      County.county_name,
      ReportYear.report_year,
      IFNULL(SUM(VR.total_vehicle_count), 0) AS total_vehicles,
      IFNULL(MAX(ChargingStationRecord.charging_station_count), 0) AS charging_stations,
      IFNULL(MAX(GasStationRecord.gas_station_count), 0) AS gas_stations,
      IFNULL(MAX(GasStationRecord.gasoline_sales), 0) AS gasoline_sales,
      IFNULL(MAX(GasStationRecord.diesel_sales), 0) AS diesel_sales
  FROM County
  CROSS JOIN ReportYear
  LEFT JOIN ZIP ON ZIP.county_id = County.county_id
  LEFT JOIN (
  SELECT zip_code, model_year, SUM(vehicle_count) AS total_vehicle_count
  FROM VehicleRecord
  GROUP BY zip_code, model_year) AS VR 
  ON ZIP.zip_code = VR.zip_code AND VR.model_year = ReportYear.report_year
  LEFT JOIN ChargingStationRecord
  ON ChargingStationRecord.county_id = County.county_id
  AND ChargingStationRecord.report_year = ReportYear.report_year
  LEFT JOIN GasStationRecord
  ON GasStationRecord.county_id = County.county_id
  AND GasStationRecord.report_year = ReportYear.report_year
  ${whereClause}
  GROUP BY County.county_name, ReportYear.report_year
  ORDER BY County.county_name, ReportYear.report_year;
`;
  // --- Column headers for template table ---
  const columns = [
    "County",
    "Year",
    "Total Vehicles",
    "Charging Stations",
    "Gas Stations",
    "Gasoline Sales (million gal)",
    "Diesel Sales (million gal)",
  ];
  // --- Run queries in sequence ---
  db.query(yearSql, (err, yearResults) => {
    if (err) throw err;

    db.query(countySql, (err, countyResults) => {
      if (err) throw err;

      db.query(dataSql, filters, (err, results) => {
        if (err) throw err;

        // Convert object array to array of arrays (rows)
        const rows = results.map((row) => [
          row.county_name,
          row.report_year,
          row.total_vehicles,
          row.charging_stations,
          row.gas_stations,
          row.gasoline_sales,
          row.diesel_sales,
        ]);

        const years = yearResults.map((row) => ({
          report_year: row.report_year,
          isSelected: row.report_year.toString() === selectedYear,
        }));

        const counties = countyResults.map((row) => ({
          county_name: row.county_name,
          isSelectedCounty: row.county_name === selectedCounty,
        }));

        res.render("overview", {
          ...getPageFlags("overview"),
          overview: results,
          years: years,
          counties: counties,
          selectedYear,
          selectedCounty,
          columns,
          rows,
        });
      });
    });
  });
});

// ------ Insight pages ------
app.get("/most_ev", (req, res) => {
  const dataSql = `
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
  ORDER BY ev_count DESC LIMIT 10;
`;

  db.query(dataSql, (err, results) => {
    if (err) throw err;

    // table rows
    const columns = ["County", "Electric Vehicles", "Rank"];
    const rows = results.map((r) => [r.county_name, r.ev_count, r.ev_rank]);

    // bar chart data
    const chartLabels = results.map((r) => r.county_name);
    const chartData = results.map((r) => r.ev_count);

    res.render("most_ev", {
      ...getPageFlags("most_ev"),
      columns,
      rows,
      chartLabelsJson: JSON.stringify(chartLabels),
      chartDataJson: JSON.stringify(chartData),
    });
  });
});

app.get("/gas_to_ev_ratio", (req, res) => {
  const dataSql = `
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
`;

  db.query(dataSql, (err, results) => {
    if (err) throw err;

    // table rows
    const columns = [
      "Year",
      "Gasoline Vehicles",
      "Electric Vehicles",
      "Gasoline Vehicles per EV",
    ];
    const rows = results.map((r) => [
      r.model_year,
      r.gas_count,
      r.ev_count,
      r.gas_to_ev_ratio,
    ]);
    const chartLabels = results.map((r) => r.model_year);
    const chartData = results.map((r) => r.gas_to_ev_ratio);

    res.render("gas_to_ev_ratio", {
      ...getPageFlags("gas_to_ev_ratio"),
      columns,
      rows,
      chartLabelsJson: JSON.stringify(chartLabels),
      chartDataJson: JSON.stringify(chartData),
    });
  });
});

app.get("/share_by_fuel", (req, res) => {
  const dataSql = `
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
`;

  db.query(dataSql, (err, results) => {
    if (err) throw err;

    // table rows
    const columns = [
      "Year",
      "Total Vehicles",
      "Gasoline Vehicles (%)",
      "Diesel Vehicles (%)",
      "Electric Vehicles (%)",
      "Hybrid Vehicles (%)",
    ];
    const rows = results.map((r) => [
      r.model_year,
      r.total_vehicle_count,
      r.gas_pct,
      r.diesel_pct,
      r.ev_pct,
      r.hybrid_pct,
    ]);
    const chartLabels = results.map((r) => r.model_year);
    const gasolineSeries = results.map((r) => +r.gas_pct);
    const dieselSeries = results.map((r) => +r.diesel_pct);
    const evSeries = results.map((r) => +r.ev_pct);
    const hybridSeries = results.map((r) => +r.hybrid_pct);

    res.render("share_by_fuel", {
      ...getPageFlags("share_by_fuel"),
      columns,
      rows,
      chartLabelsJson: JSON.stringify(chartLabels),
      gasJson: JSON.stringify(gasolineSeries),
      dieselJson: JSON.stringify(dieselSeries),
      evJson: JSON.stringify(evSeries),
      hybridJson: JSON.stringify(hybridSeries),
    });
  });
});

app.get("/gas_station_vs_charging_station", (req, res) => {
  const dataSql = `
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
  `;

  db.query(dataSql, (err, results) => {
    if (err) throw err;

    // table rows
    const columns = [
      "Rank",
      "County",
      "Year",
      "Gas Stations",
      "Previous Gas Stations",
      "Gas Station Change (%)",
      "EV Stations",
      "Previous EV Stations",
      "EV Station Change (%)",
    ];
    const rows = results.map((r) => [
      r.ev_rank,
      r.county,
      r.report_year,
      r.gas_station_count,
      r.prev_gas_count,
      r.gas_change,
      r.ev_chargers,
      r.prev_ev_chargers,
      r.charger_change,
    ]);
    res.render("gas_station_vs_charging_station", {
      ...getPageFlags("gas_station_vs_charging_station"),
      columns,
      rows,
    });
  });
});

app.get("/fossil_sales", (req, res) => {
  const dataSql = `
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
`;

  db.query(dataSql, (err, results) => {
    if (err) throw err;

    // table rows
    const columns = [
      "Rank",
      "County",
      "Year",
      "Gasoline Sales (million gal)",
      "Previous Gasoline Sales (million gal)",
      "Gasoline sales Change (%)",
      "Diesel Sales (million gal)",
      "Previous Diesel Sales (million gal)",
      "Diesels Sales Change (%)",
    ];
    const rows = results.map((r) => [
      r.ev_rank,
      r.county_name,
      r.report_year,
      r.gasoline_sales,
      r.prev_gasoline_sales,
      r.gas_change_pct,
      r.diesel_sales,
      r.prev_diesel_sales,
      r.diesel_change_pct,
    ]);

    res.render("fossil_sales", {
      ...getPageFlags("fossil_sales"),
      columns,
      rows,
    });
  });
});

app.listen(port, () => console.log(`App running at http://localhost:${port}`));

// helper function
function getPageFlags(page) {
  return {
    currentPage: page,
    currentPageIsOverview: page === "overview",
    currentPageIsMostEV: page === "most_ev",
    currentPageIsGasToEVRatio: page === "gas_to_ev_ratio",
    currentPageIsShareByFuel: page === "share_by_fuel",
    currentPageIsGasVsCharging: page === "gas_station_vs_charging_station",
    currentPageIsFossilSales: page === "fossil_sales",
  };
}
