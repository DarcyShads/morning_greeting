async function updatequote() {
  response = await fetch("/info");
  data = await response.json();
  console.log(data);
}

updatequote();
