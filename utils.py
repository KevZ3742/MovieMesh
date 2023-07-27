from dotenv import load_dotenv
import os
import json
import requests

load_dotenv()

cache = {}

def formatParameters(name, value):
    '''Checks for a value and formats it for a given parameter'''
    if value:
        return f"{name}={value.replace(' ', '%20')}"
    else:
        return ""
    
def prettyPrint(str, indention):
    '''Returns an easy to read json string'''
    try:
        data = str.json()
        jsonStr = json.dumps(data, indent=indention)
        return jsonStr
    except json.JSONDecodeError:
        print("Failed to parse response as JSON.")
        return str.text
    
def cleanedPrettyPrint(str, indention):
    '''Returns an easy to read json string with only relevent information'''
    allowedKeys = ["media_type", "name", "title", "id", "overview", "release_date", "poster_path"]

    try:
        data = str.json()
        results = data["results"]

        data["results"] = dataCleaner(results, allowedKeys)
        jsonStr = json.dumps(data, indent=indention)
        return jsonStr
    except json.JSONDecodeError:
        print("Failed to parse response as JSON.")
        return str.text

def dataCleaner(data, allowedKeys):
    '''Returns a json string with only input information'''
    filteredData = []
    for obj in data:
        filteredResults = {}
        for key in allowedKeys:
            if key in obj:
                filteredResults[key] = obj[key]
        filteredData.append(filteredResults)

    return filteredData

def getActorCredits(id):
    '''Returns list of evey movie/TV show the specified actor has played in'''
    creditsUrl = f'{os.getenv("BASE_URL")}person/{id}/combined_credits'
    params = {
        'api_key': os.getenv("API_KEY")
    }

    response = requests.get(creditsUrl, params=params)

    if response.status_code == 200:
        data = response.json()
        allowedKeys = ["media_type", "name", "title", "id", "overview", "release_date", "poster_path", "character"]
        data = dataCleaner(data["cast"], allowedKeys)
        return data
    else:
        raise ValueError(f"Failed to fetch actor credits. Status code: {response.status_code}")

def getMovieOrTvShowCredits(media_type, media_id):
    '''Returns list of every actor that played in a specified movie/TV show'''
    creditsUrl = f'{os.getenv("BASE_URL")}{media_type}/{media_id}/credits'
    params = {
        'api_key': os.getenv("API_KEY")
    }

    response = requests.get(creditsUrl, params=params)

    if response.status_code == 200:
        data = response.json()
        allowedKeys = ["media_type", "name", "title", "id", "overview", "release_date", "poster_path", "character"]
        data = dataCleaner(data["cast"], allowedKeys)
        return data
    else:
        raise ValueError(f"Failed to fetch {media_type} credits. Status code: {response.status_code}")

def listActorMoviesAndTvShows(name, id):
    '''Prints a list of every movie/TV show the specified actor has played in'''
    try:
        credits = getActorCredits(id)

        print(f"Movies and TV shows {name} (ID: {id}) has played in:")
        counter = 1
        for credit in credits:
            title = credit['title'] if 'title' in credit else credit['name']
            print(f"{counter} - {title} ({credit['media_type']})")
            counter += 1
    except ValueError as e:
        print(e)

def listActorsInMovieOrTvShow(title, id, media_type):
    '''Prints a list of every actors that played in a specified movie/TV show'''
    try:
        credits = getMovieOrTvShowCredits(media_type, id)

        print(f"Actors in '{title}' (ID: {id}) ({media_type}):")
        counter = 1
        for actor in credits:
            actorName = actor['name']
            characterName = actor['character']
            print(f"{counter} - {actorName} as {characterName}")
            counter += 1
    except ValueError as e:
        print(e)

def nodeSelection(data):
    '''Displays connections between actors and the movies'''
    selection = input("Selection (int): ")

    if not selection.isdigit():
        exit()
    else:
        selection = int(selection) - 1

    moviesAndShows = []
    cast = []

    if data["media_type"] == "person":
        if (data["name"], data["id"], data["media_type"]) in cache:
            moviesAndShows = cache[(data["name"], data["id"], data["media_type"])]
        else:
            moviesAndShows = getActorCredits(data["id"])
            cache[(data["name"], data["id"], data["media_type"])] = moviesAndShows
    elif data["media_type"] == "movie":
        if (data["title"], data["id"], data["media_type"]) in cache:
            cast = cache[(data["title"], data["id"], data["media_type"])]
        else:
            cast = getMovieOrTvShowCredits(data["media_type"], data["id"])
            cache[(data["title"], data["id"], data["media_type"])] = cast
    elif data["media_type"] == "tv":
        if (data["name"], data["id"], data["media_type"]) in cache:
            cast = cache[(data["name"], data["id"], data["media_type"])]
        else:
            cast = getMovieOrTvShowCredits(data["media_type"], data["id"])
            cache[(data["name"], data["id"], data["media_type"])] = cast

    if moviesAndShows == []:
        data = cast[selection]
        data["media_type"] = "person"
        listActorMoviesAndTvShows(data["name"], data["id"])
    elif cast == []:
        data = moviesAndShows[selection]
        if data["media_type"] == "movie":
            listActorsInMovieOrTvShow(data["title"], data["id"], data["media_type"])
        elif data["media_type"] == "tv":
            listActorsInMovieOrTvShow(data["name"], data["id"], data["media_type"])

    nodeSelection(data)