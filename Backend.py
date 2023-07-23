from dotenv import load_dotenv
import os
import requests
from utils import *

load_dotenv()

query = input("query (str): ")
include_adult = input("include_adult (bool): ")
language = input("language (str): ")
page = input("page (int): ")

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

print(cleanedPrettyPrint(response, 2))

selection = int(input("Select (int): "))

if data["results"][selection]["media_type"] == "person":
    listActorMoviesAndTvShows(data["results"][selection]["name"], data["results"][selection]["id"])
elif data["results"][selection]["media_type"] == "movie":
    listActorsInMovieOrTvShow(data["results"][selection]["title"], data["results"][selection]["id"], data["results"][selection]["media_type"])
elif data["results"][selection]["media_type"] == "tv":
    listActorsInMovieOrTvShow(data["results"][selection]["name"], data["results"][selection]["id"], data["results"][selection]["media_type"])