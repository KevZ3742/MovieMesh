// Test data
const data = [
    {
        imgSrc: "temp1.jpg",
        text: "Apple",
    },
    {
        imgSrc: "temp2.jpg",
        text: "Banana",
    },
    {
        imgSrc: "temp3.jpg",
        text: "Cherry",
    },
];

const searchInput = document.getElementById("query");
const searchResults = document.getElementById("search-results");

function updateResults() {
    const query = searchInput.value.toLowerCase();
    const filteredData = data.filter(item =>
        item.text.toLowerCase().includes(query)
    );

    searchResults.innerHTML = "";

    filteredData.forEach(item => {
        const li = document.createElement("li");
        const img = document.createElement("img");
        img.src = item.imgSrc;
        li.appendChild(img);

        const span = document.createElement("span");
        span.textContent = item.text;
        li.appendChild(span);

        searchResults.appendChild(li);
    });

    if (query === "") {
        searchResults.style.display = "none";
    } else {
        searchResults.style.display = "block";
    }
}

searchInput.addEventListener("input", updateResults);

searchResults.addEventListener("click", event => {
    if (event.target.tagName === "LI") {
        const selectedText = event.target.textContent.trim();
        searchInput.value = selectedText;
        searchResults.style.display = "none";
    }
});  