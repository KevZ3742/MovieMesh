from dotenv import load_dotenv
import os
import requests
from utils import *

load_dotenv()

query = input("query: ")
include_adult = input("include_adult: ")
language = input("language: ")
page = input("page: ")

query = formatParameters("query", query)
include_adult = formatParameters("include_adult", include_adult)
language = formatParameters("language", language)
page = formatParameters("page", page)

url = os.getenv("BASE_URL") + "search/multi?" + query + "&" + include_adult + "&" + language + "&" +  page

headers = {
    "accept": "application/json",
    "Authorization": os.getenv("Access_Token_Auth")
}

response = requests.get(url, headers=headers)
data = response.json()

print(prettyPrint(response, 2))
print(data["results"][0]["media_type"])

if data["results"][0]["media_type"] == "person":
    listActorMoviesAndTvShows(data["results"][0]["name"])
elif data["results"][0]["media_type"] == "movie":
    listActorsInMovieOrTvShow(data["results"][0]["title"], data["results"][0]["media_type"])
elif data["results"][0]["media_type"] == "tv":
    listActorsInMovieOrTvShow(data["results"][0]["name"], data["results"][0]["media_type"])