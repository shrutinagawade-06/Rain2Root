
const $ = (id) => document.getElementById(id);

const numberFormat = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0
});

function litres(value) {
  return numberFormat.format(Math.round(value)) + " L";
}

// Open-Meteo requires no API key. Keep lookups opt-in until configured here.
const WEATHER_API_CONFIG = {
  enabled: false
};

const rainfallInput = $("rainfall");
const weatherStatus = $("weatherStatus");
const cityWeatherBtn = $("cityWeatherBtn");
const geolocationBtn = $("geolocationBtn");

function setRainfallProvenance(source, date) {
  $("rainfallSource").textContent = source;
  $("rainfallDate").textContent = date;
}

function setWeatherStatus(message) {
  weatherStatus.textContent = message;
}

function setWeatherBusy(isBusy) {
  cityWeatherBtn.disabled = isBusy || !WEATHER_API_CONFIG.enabled;
  geolocationBtn.disabled = isBusy || !WEATHER_API_CONFIG.enabled;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather service returned HTTP ${response.status}.`);
  }
  return response.json();
}

async function getCityCoordinates(city) {
  const query = new URLSearchParams({
    name: city,
    count: "1",
    language: "en",
    format: "json"
  });
  const data = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?${query}`
  );
  const result = data.results && data.results[0];

  if (!result || !Number.isFinite(result.latitude) ||
      !Number.isFinite(result.longitude)) {
    throw new Error("No matching city was found. Check the spelling or enter rainfall manually.");
  }

  const place = [result.name, result.admin1, result.country]
    .filter(Boolean)
    .filter((part, index, parts) => parts.indexOf(part) === index)
    .join(", ");

  return { latitude: result.latitude, longitude: result.longitude, place };
}

async function loadAnnualRainfall(location) {
  const year = new Date().getFullYear() - 1;
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const query = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    daily: "precipitation_sum",
    timezone: "auto",
    start_date: startDate,
    end_date: endDate
  });
  const data = await fetchJson(
    `https://archive-api.open-meteo.com/v1/archive?${query}`
  );
  const days = data.daily && data.daily.time;
  const precipitation = data.daily && data.daily.precipitation_sum;
  const expectedDays = (Date.UTC(year + 1, 0, 1) -
    Date.UTC(year, 0, 1)) / 86400000;

  if (!Array.isArray(days) || !Array.isArray(precipitation) ||
      days.length !== expectedDays || precipitation.length !== expectedDays ||
      days[0] !== startDate || days[days.length - 1] !== endDate ||
      !days.every((date, index) =>
        date === new Date(Date.UTC(year, 0, index + 1))
          .toISOString()
          .slice(0, 10)
      ) ||
      !precipitation.every((amount) =>
        Number.isFinite(amount) && amount >= 0
      )) {
    throw new Error(`Complete daily rainfall data for ${year} is unavailable.`);
  }

  const annualTotal = precipitation.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isFinite(annualTotal) || annualTotal > 10000) {
    throw new Error("The returned annual rainfall is outside the supported range.");
  }

  rainfallInput.value = annualTotal.toFixed(1);
  setRainfallProvenance(
    `Open-Meteo Historical Weather API (${location.place})`,
    `Jan 1-Dec 31, ${year} (annual total)`
  );
  setWeatherStatus(
    `Loaded historical rainfall for ${location.place}. This is a complete past-year total, not a live forecast.`
  );
  $("waterForm").requestSubmit();
}

async function lookupCityRainfall() {
  const city = $("location").value.trim();
  if (!city) {
    setWeatherStatus("Enter a city before requesting rainfall data.");
    $("location").focus();
    return;
  }

  setWeatherBusy(true);
  setWeatherStatus(`Looking up ${city}...`);
  try {
    const location = await getCityCoordinates(city);
    $("location").value = location.place;
    await loadAnnualRainfall(location);
  } catch (error) {
    setWeatherStatus(`Rainfall lookup failed: ${error.message} You can enter rainfall manually.`);
  } finally {
    setWeatherBusy(false);
  }
}

function lookupCurrentLocationRainfall() {
  if (!navigator.geolocation) {
    setWeatherStatus("Browser geolocation is unavailable. Enter a city or rainfall manually.");
    return;
  }

  setWeatherBusy(true);
  setWeatherStatus("Requesting your location. Allow access in the browser prompt to continue.");
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const place = `browser location (${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)})`;
      $("location").value = place;
      try {
        await loadAnnualRainfall({
          latitude: coords.latitude,
          longitude: coords.longitude,
          place
        });
      } catch (error) {
        setWeatherStatus(`Rainfall lookup failed: ${error.message} You can enter rainfall manually.`);
      } finally {
        setWeatherBusy(false);
      }
    },
    (error) => {
      const message = error.code === error.PERMISSION_DENIED
        ? "Location permission was denied."
        : error.code === error.POSITION_UNAVAILABLE
          ? "Your location could not be determined."
          : "The location request timed out.";
      setWeatherStatus(`${message} Enter a city or rainfall manually.`);
      setWeatherBusy(false);
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
  );
}

setWeatherBusy(false);
if (WEATHER_API_CONFIG.enabled) {
  setWeatherStatus(
    "Open-Meteo lookup is enabled. Choose a city or explicitly allow browser location to load historical rainfall."
  );
}

cityWeatherBtn.addEventListener("click", () => {
  if (WEATHER_API_CONFIG.enabled) {
    lookupCityRainfall();
  }
});

geolocationBtn.addEventListener("click", () => {
  if (WEATHER_API_CONFIG.enabled) {
    lookupCurrentLocationRainfall();
  }
});

rainfallInput.addEventListener("input", () => {
  setRainfallProvenance("Manual rainfall input", "User-provided; no date");
});

// Mobile navigation
const menuBtn = $("menuBtn");
const nav = $("nav");

menuBtn.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
});

nav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  });
});

// Rainwater collection calculator
$("waterForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const roof = Number($("roof").value);
  const rainfall = Number($("rainfall").value);
  const efficiency = Number($("efficiency").value);
  const location = $("location").value.trim();

  if (
    !Number.isFinite(roof) ||
    !Number.isFinite(rainfall) ||
    !Number.isFinite(efficiency) ||
    roof <= 0 || roof > 1000000 ||
    rainfall < 0 || rainfall > 10000 ||
    efficiency < 1 || efficiency > 100
  ) {
    alert("Please enter valid roof, rainfall and efficiency values.");
    return;
  }

  const annual = roof * rainfall * efficiency / 100;

  $("waterResult").textContent = litres(annual);
  $("monthlyResult").textContent = litres(annual / 12);
  $("dailyResult").textContent = litres(annual / 365);

  $("calcNote").textContent =
    `Planning estimate${location ? " for " + location : ""}. ` +
    "Actual collection depends on rainfall distribution, roof material, " +
    "first-flush losses and system performance.";
});

// Budget estimator
function updateBudget() {
  const roof = Number($("roofBudget").value);
  const rate = Number($("costRate").value);

  if (
    !Number.isFinite(roof) ||
    !Number.isFinite(rate) ||
    roof <= 0 || roof > 1000000 ||
    rate < 0 || rate > 1000000
  ) {
    $("budgetResult").textContent = "Enter valid values";
    return;
  }

  $("budgetResult").textContent =
    "₹" + numberFormat.format(Math.round(roof * rate));
}

$("budgetBtn").addEventListener("click", updateBudget);

// Sensor dashboard
let monitorMode = "demo";
let pollTimer = null;
let demoLevel = 72;

function setConnectionStatus(message, type = "") {
  const el = $("connectionStatus");
  el.textContent = message;
  el.className = "connection-status " + type;
}

function showTankLevel(level) {
  const value = Math.max(0, Math.min(100, level));

  $("tankLevel").textContent = value + "%";
  $("tankBar").style.width = value + "%";
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function showDemo() {
  stopPolling();
  monitorMode = "demo";

  $("deviceState").textContent = "Demo";
  $("readingSource").textContent = "Simulated reading";
  $("distanceValue").textContent = "-- cm";
  $("lastUpdated").textContent = "Not connected to hardware";
  $("rechargeState").textContent = "Not measured";

  showTankLevel(demoLevel);
  setConnectionStatus(
    "Demo mode is active. Values are simulated.",
    "waiting"
  );
}

async function fetchESP32Reading() {
  if (monitorMode !== "live") return;

  const rawUrl = $("deviceUrl").value.trim();

  try {
    const url = new URL(rawUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Use an HTTP or HTTPS device address.");
    }

    // Request fresh sensor data, not a cached response.
    url.pathname = "/api/status";
    url.search = "";
    url.hash = "";

    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      throw new Error("ESP32 returned HTTP " + response.status);
    }

    const data = await response.json();
    if (data.sensorOk === false) {
  throw new Error(data.error || "Water-level sensor reading failed.");
}

    if (
      typeof data.levelPercent !== "number" ||
      !Number.isFinite(data.levelPercent) ||
      data.levelPercent < 0 ||
      data.levelPercent > 100
    ) {
      throw new Error("Invalid tank-level data received.");
    }

    if (monitorMode !== "live") return;

    showTankLevel(data.levelPercent);
    $("deviceState").textContent = "Connected";
    $("readingSource").textContent = "Actual ESP32 response";

    if (
      typeof data.distanceCm === "number" &&
      Number.isFinite(data.distanceCm)
    ) {
      $("distanceValue").textContent =
        data.distanceCm.toFixed(1) + " cm";
    } else {
      $("distanceValue").textContent = "-- cm";
    }

    $("lastUpdated").textContent =
      "Updated " + new Date().toLocaleTimeString();

    $("rechargeState").textContent = "Not measured";

    setConnectionStatus(
      "Connected to ESP32. Sensor data received.",
      ""
    );
  } catch (error) {
    if (monitorMode !== "live") return;

    $("deviceState").textContent = "Offline";
    $("readingSource").textContent = "No current reading";
    setConnectionStatus(
      "Could not read ESP32: " + error.message +
      ". Check the IP, Wi-Fi, power and sensor.",
      "error"
    );
  }
}

function connectESP32() {
  stopPolling();
  monitorMode = "live";

  $("deviceState").textContent = "Connecting";
  $("readingSource").textContent = "Waiting for ESP32";
  setConnectionStatus("Connecting to ESP32...", "waiting");

  // Fetch immediately, then retry every 2 seconds.
  fetchESP32Reading();
  pollTimer = setInterval(fetchESP32Reading, 2000);
}

$("demoBtn").addEventListener("click", showDemo);
$("liveBtn").addEventListener("click", connectESP32);

// Initial values
$("year").textContent = new Date().getFullYear();
$("waterForm").requestSubmit();
updateBudget();
showDemo();
// Rain2Root location feature
const locationBtn = $("locationBtn");

if (locationBtn) {
  locationBtn.addEventListener("click", () => {
    const status = $("locationStatus");

    if (!navigator.geolocation) {
      status.textContent =
        "Geolocation is not supported by this browser.";
      return;
    }

    status.textContent = "Requesting your location...";
    locationBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        $("coordinates").textContent =
          `Latitude: ${lat.toFixed(5)}, ` +
          `Longitude: ${lon.toFixed(5)}`;

        $("placeName").textContent =
          "Location detected successfully.";

        $("locationResults").hidden = false;
        status.textContent = "Loading local rainfall forecast...";

        try {
          const url =
            "https://api.open-meteo.com/v1/forecast" +
            `?latitude=${lat}&longitude=${lon}` +
            "&daily=precipitation_sum" +
            "&forecast_days=7&timezone=auto";

          const response = await fetch(url);

          if (!response.ok) {
            throw new Error("Weather service unavailable.");
          }

          const data = await response.json();
          const rainfall = data.daily.precipitation_sum;
          const totalRainfall = rainfall.reduce(
            (sum, value) => sum + (value ?? 0), 0
          );

          const roofArea = Number($("roofArea").value);
          const efficiency = 0.8; // Assumed 80% collection efficiency

          $("rainfallInfo").textContent =
            `Forecast rainfall for 7 days: ` +
            `${totalRainfall.toFixed(1)} mm.`;

          if (roofArea > 0) {
            const litres =
              roofArea * totalRainfall * efficiency;

            $("harvestingAdvice").textContent =
              `Your ${roofArea} m² roof could collect approximately ` +
              `${litres.toFixed(0)} litres over these 7 days, ` +
              `assuming 80% collection efficiency.`;
          } else {
            $("harvestingAdvice").textContent =
              "Enter a valid roof area to estimate water collection.";
          }

          status.textContent = "Location and forecast loaded.";
        } catch (error) {
          status.textContent =
            "Location detected, but rainfall data could not be loaded.";
          $("rainfallInfo").textContent =
            "Please check your internet connection and try again.";
        } finally {
          locationBtn.disabled = false;
        }
      },
      (error) => {
        const messages = {
          1: "Location permission was denied. Allow location access in your browser.",
          2: "Your location could not be determined. Please try again.",
          3: "Location request timed out. Please try again."
        };

        status.textContent =
          messages[error.code] || "Unable to detect your location.";

        locationBtn.disabled = false;
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000
      }
    );
  });
}
let rainMap;
let locationMarker;

function showLocationOnMap(lat, lon) {
  if (!rainMap) {
    rainMap = L.map("map").setView([lat, lon], 15);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(rainMap);
  } else {
    rainMap.setView([lat, lon], 15);
  }

  if (locationMarker) {
    locationMarker.setLatLng([lat, lon]);
  } else {
    locationMarker = L.marker([lat, lon]).addTo(rainMap);
  }

  locationMarker.bindPopup("Your selected Rain2Root location").openPopup();

  document.getElementById("addressText").textContent =
    `Coordinates: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

document.getElementById("locateAgain").addEventListener("click", () => {
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => showLocationOnMap(
      coords.latitude,
      coords.longitude
    ),
    () => alert("Please allow location access and try again.")
  );
});
// Rain2Root location feature
const locationBtn = $("locationBtn");

if (locationBtn) {
  locationBtn.addEventListener("click", () => {
    const status = $("locationStatus");

    if (!navigator.geolocation) {
      status.textContent =
        "Geolocation is not supported by this browser.";
      return;
    }

    status.textContent = "Requesting your location...";
    locationBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        $("coordinates").textContent =
          `Latitude: ${lat.toFixed(5)}, ` +
          `Longitude: ${lon.toFixed(5)}`;

        $("placeName").textContent =
          "Location detected successfully.";

        $("locationResults").hidden = false;
        status.textContent = "Loading local rainfall forecast...";

        try {
          const url =
            "https://api.open-meteo.com/v1/forecast" +
            `?latitude=${lat}&longitude=${lon}` +
            "&daily=precipitation_sum" +
            "&forecast_days=7&timezone=auto";

          const response = await fetch(url);

          if (!response.ok) {
            throw new Error("Weather service unavailable.");
          }

          const data = await response.json();
          const rainfall = data.daily.precipitation_sum;
          const totalRainfall = rainfall.reduce(
            (sum, value) => sum + (value ?? 0), 0
          );

          const roofArea = Number($("roofArea").value);
          const efficiency = 0.8; // Assumed 80% collection efficiency

          $("rainfallInfo").textContent =
            `Forecast rainfall for 7 days: ` +
            `${totalRainfall.toFixed(1)} mm.`;

          if (roofArea > 0) {
            const litres =
              roofArea * totalRainfall * efficiency;

            $("harvestingAdvice").textContent =
              `Your ${roofArea} m² roof could collect approximately ` +
              `${litres.toFixed(0)} litres over these 7 days, ` +
              `assuming 80% collection efficiency.`;
          } else {
            $("harvestingAdvice").textContent =
              "Enter a valid roof area to estimate water collection.";
          }

          status.textContent = "Location and forecast loaded.";
        } catch (error) {
          status.textContent =
            "Location detected, but rainfall data could not be loaded.";
          $("rainfallInfo").textContent =
            "Please check your internet connection and try again.";
        } finally {
          locationBtn.disabled = false;
        }
      },
      (error) => {
        const messages = {
          1: "Location permission was denied. Allow location access in your browser.",
          2: "Your location could not be determined. Please try again.",
          3: "Location request timed out. Please try again."
        };

        status.textContent =
          messages[error.code] || "Unable to detect your location.";

        locationBtn.disabled = false;
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000
      }
    );
  });
}
