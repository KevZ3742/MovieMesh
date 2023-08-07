const searchInput = document.getElementById("query");
const searchResults = document.getElementById("search-results");
let debounceTimer;

async function fetchSearchResults(query) {
  try {
    const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching data:", error);
    return [];
  }
}

async function updateResults() {
  const query = searchInput.value.toLowerCase();

  searchResults.innerHTML = "";

  if (query === "") {
    searchResults.style.display = "none";
    clearTimeout(debounceTimer);
    return;
  }

  // Debounce
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const searchResultsData = await fetchSearchResults(query);

    searchResultsData.forEach(item => {
      let dataType;
      let imgSrc;
      let year;

      if (item.media_type === "movie") {
        dataType = "Movie";
        imgSrc = `https://image.tmdb.org/t/p/w92${item.poster_path}`;
        year = item.release_date ? item.release_date.substring(0, 4) : "N/A";
      } else if (item.media_type === "tv") {
        dataType = "TV Show";
        imgSrc = `https://image.tmdb.org/t/p/w92${item.poster_path}`;
        year = item.first_air_date ? item.first_air_date.substring(0, 4) : "N/A";
      } else if (item.media_type === "person") {
        dataType = "Actor";
        imgSrc = `https://image.tmdb.org/t/p/w92${item.profile_path}`;
        year = "";
      } else {
        // Unsupported media type, skip
        return;
      }

      const li = document.createElement("li");

      const img = document.createElement("img");
      img.src = imgSrc;
      li.appendChild(img);

      const div = document.createElement("div")

      const h3 = document.createElement("h3");
      h3.textContent = dataType === "Actor" ? item.name : (item.title || item.name);
      div.appendChild(h3);

      if (year) {
        const p = document.createElement("p")
        p.textContent = year;
        div.appendChild(p);
      }

      li.appendChild(div)

      searchResults.appendChild(li);
    });

    searchResults.style.display = "block";
  }, 300);
}

searchInput.addEventListener("input", updateResults);

searchResults.addEventListener("click", event => {
  if (event.target.tagName === "LI") {
    const selectedText = event.target.textContent.trim();
    searchInput.value = selectedText;
    searchResults.style.display = "none";
  }
});