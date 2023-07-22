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


url = "https://api.themoviedb.org/3/search/multi?" + query + "&" + include_adult + "&" + language + "&" +  page

headers = {
    "accept": "application/json",
    "Authorization": os.getenv("accessTokenAuth")
}

response = requests.get(url, headers=headers)

print(prettyPrint(response, 2))