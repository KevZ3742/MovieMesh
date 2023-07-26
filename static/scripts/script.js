// Test data
const data = [
    "Apple",
    "Banana",
    "Cherry",
    "Grapes",
    "Lemon",
    "Orange",
    "Peach",
    "Pear",
    "Strawberry",
    "Apple",
    "Banana",
    "Cherry",
    "Grapes",
    "Lemon",
    "Orange",
    "Peach",
    "Pear",
    "Strawberry",
    "Apple",
    "Banana",
    "Cherry",
    "Grapes",
    "Lemon",
    "Orange",
    "Peach",
    "Pear",
    "Strawberry",
    "Apple",
    "Banana",
    "Cherry",
    "Grapes",
    "Lemon",
    "Orange",
    "Peach",
    "Pear",
    "Strawberry",
    "Apple",
    "Banana",
    "Cherry",
    "Grapes",
    "Lemon",
    "Orange",
    "Peach",
    "Pear",
    "Strawberry",
    "Apple",
    "Banana",
    "Cherry",
    "Grapes",
    "Lemon",
    "Orange",
    "Peach",
    "Pear",
    "Strawberry",
    "Apple",
    "Banana",
    "Cherry",
    "Grapes",
    "Lemon",
    "Orange",
    "Peach",
    "Pear",
    "Strawberry",
    "Apple",
    "Banana",
    "Cherry",
    "Grapes",
    "Lemon",
    "Orange",
    "Peach",
    "Pear",
    "Strawberry",
    "Apple",
    "Banana",
    "Cherry",
    "Grapes",
    "Lemon",
    "Orange",
    "Peach",
    "Pear",
    "Strawberry",
];

const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");

function updateResults() {
    const query = searchInput.value.toLowerCase();
    const filteredData = data.filter(item =>
        item.toLowerCase().includes(query)
    );

    searchResults.innerHTML = "";

    filteredData.forEach(item => {
        const li = document.createElement("li");
        li.textContent = item;
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
        searchInput.value = event.target.textContent;
        searchResults.style.display = "none";
    }
});
