import fetch from "node-fetch";
import Express from "express";
import "dotenv/config";
import schedule from "node-schedule";
import fs from "fs";
import moment from "moment";

const port = process.env.PORT || 3000;
const app = Express();
app.listen(port, () => {
  console.log(`Listening at port ${port}`);
});
app.use(Express.static("public"));

async function getQuote() {
  const quote_endpoint = "https://zenquotes.io/api/today";
  const response = await fetch(quote_endpoint);
  const data = await response.json();
  return data[0].q;
}

function addParamtoURL(url, param) {
  const newURL = new URL(url);
  for (const [key, value] of Object.entries(param))
    newURL.searchParams.append(key, value);
  return newURL.href;
}

async function getNews() {
  const news_endpoint = "https://newsapi.org/v2/top-headlines";
  const parameters = {
    sources: "the-hindu",
  };
  const finalUrl = addParamtoURL(news_endpoint, parameters);

  const options = {
    headers: {
      "X-Api-Key": process.env.newsapi,
    },
  };

  const response = await fetch(finalUrl, options);
  const data = await response.json();
  const req_Data = [];
  var count = 0;
  try {
    for (const article of data.articles) {
      const title = article.title;
      const description = article.description;
      const url = article.url;
      const img = article.urlToImage;
      if (title == null || description == null || url == null || img == null)
        continue;
      req_Data.push({ title, description, url, img });
      count++;
      if (count == 5) break;
    }
    return req_Data;
  } catch (err) {
    return null;
  }
}

function changeToCelsius(temp, unit) {
  if (unit == "F") temp = ((temp - 32) * 5) / 9;
  else if (unit == "K") temp -= 273.15;
  return Math.round(temp * 100) / 100;
}

async function getWeather() {
  const location_endpoint =
    "http://dataservice.accuweather.com/locations/v1/cities/search";
  const parameters = {
    apikey: process.env.accuweatherapi,
    q: "dehradun",
  };

  const finalLocationUrl = addParamtoURL(location_endpoint, parameters);
  try {
    const locResponse = await fetch(finalLocationUrl);
    const locData = await locResponse.json();
    const location_key = locData[0].Key;

    const weather_endpoint = `http://dataservice.accuweather.com/forecasts/v1/daily/1day/${location_key}`;
    delete parameters.q;
    const finalUrl = addParamtoURL(weather_endpoint, parameters);

    const response = await fetch(finalUrl);
    const data = await response.json();
    const headline = data.Headline.Text;
    var min = data.DailyForecasts[0].Temperature.Minimum.Value;
    var max = data.DailyForecasts[0].Temperature.Maximum.Value;
    var unit = data.DailyForecasts[0].Temperature.Maximum.Unit;
    if (unit != "C") {
      min = changeToCelsius(min, unit);
      max = changeToCelsius(max, unit);
    }
    unit = "°C";
    var icon = data.DailyForecasts[0].Day.Icon;
    var icophrase = data.DailyForecasts[0].Day.IconPhrase;
    const day = { icon, icophrase };
    icon = data.DailyForecasts[0].Night.Icon;
    icophrase = data.DailyForecasts[0].Night.IconPhrase;
    const night = { icon, icophrase };
    return { headline, min, max, unit, day, night };
  } catch (err) {
    return null;
  }
}

async function getAstro() {
  const location_endpoint = "https://api.stormglass.io/v2/astronomy/point";
  const parameters = {
    lat: process.env.latitude,
    lng: process.env.longitude,
  };

  const finalUrl = addParamtoURL(location_endpoint, parameters);

  const options = {
    headers: {
      Authorization: process.env.astroapi,
    },
  };

  const response = await fetch(finalUrl, options);
  const data = await response.json();
  console.log(data);
  try {
    const sunrise = data.data[0].sunrise;
    const sunset = data.data[0].sunset;
    const moonrise = data.data[0].moonrise;
    const moonset = data.data[0].moonset;
    const moonphase = data.data[0].moonPhase.current.text;
    return { sunrise, sunset, moonrise, moonset, moonphase };
  } catch (err) {
    return null;
  }
}

async function saveNewsData() {
  const news = await getNews();
  const lastUpdate = moment().format("D-MM-YYYY H:mm:ss");
  const dataFile = fs.readFileSync("data.json");
  const data = JSON.parse(dataFile);
  data.news = news;
  data.lastUpdate = lastUpdate;
  fs.writeFileSync("data.json", JSON.stringify(data));
  console.log("News Data saved");
}

async function saveData() {
  const quote = await getQuote();
  const news = await getNews();
  const weather = await getWeather();
  const astronomy = await getAstro();
  const lastUpdate = moment().format("D-MM-YYYY H:mm:ss");
  const data = { weather, astronomy, news, quote, lastUpdate };
  fs.writeFileSync("data.json", JSON.stringify(data));
  console.log("Data saved");
}

function getResetStat() {
  const dataFile = fs.readFileSync("data.json");
  const data = JSON.parse(dataFile);
  const update = data.lastUpdate.split(" ");
  const [dd, mm, yyyy] = update[0].split("-");
  const [hh, m, ss] = update[1].split(":");
  const dx = new Date(yyyy, mm - 1, dd, hh, m, ss);
  const t = (Date.now() - Date.parse(dx)) / 1000 / 60 / 60;
  return t > 12 ? "all" : t > 4 ? "news" : "none";
}

app.get("/info", async (req, res) => {
  const reset = getResetStat();
  if (reset == "all") saveData();
  else if (reset == "news") saveNewsData();

  const dataFile = fs.readFileSync("data.json");
  const data = JSON.parse(dataFile);
  res.send(data);
});

const rule4h = new schedule.RecurrenceRule();
rule4h.dayOfWeek = [0, 6];
rule4h.hour = [4,5, 8, 12, 16, 20];
const newsJob = schedule.scheduleJob(rule4h, saveNewsData);
newsJob.tz = "Asia/Kolkata";

const dataJob = schedule.scheduleJob(
  { hour: 0, minute: 0, second: 30 },
  saveData
);
dataJob.tz = "Asia/Kolkata";
