from dotenv import load_dotenv
import os
import json
import requests

load_dotenv()

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
    try:
        allowedKeys = ["media_type", "name", "title", "id", "overview"]
        data = str.json()
        results = data["results"]

        filteredData = []
        for result in results:
            filteredResults = {}
            for key in allowedKeys:
                if key in result:
                    filteredResults[key] = result[key]
            filteredData.append(filteredResults)

        data["results"] = filteredData
        jsonStr = json.dumps(data, indent=indention)
        return jsonStr
    except json.JSONDecodeError:
        print("Failed to parse response as JSON.")
        return str.text

def getActorId(name):
    '''Returns the specified actor's Id'''
    searchUrl = f'{os.getenv("BASE_URL")}search/person'
    params = {
        'api_key': os.getenv("API_KEY"),
        'query': name
    }

    response = requests.get(searchUrl, params=params)

    if response.status_code == 200:
        data = response.json()
        if data['results']:
            return data['results'][0]['id']
        else:
            raise ValueError(f"Actor '{name}' not found.")
    else:
        raise ValueError(f"Failed to fetch actor details. Status code: {response.status_code}")

def getActorCredits(id):
    '''Returns list of evey movie/TV show the specified actor has played in'''
    creditsUrl = f'{os.getenv("BASE_URL")}person/{id}/combined_credits'
    params = {
        'api_key': os.getenv("API_KEY")
    }

    response = requests.get(creditsUrl, params=params)

    if response.status_code == 200:
        data = response.json()
        return data['cast']
    else:
        raise ValueError(f"Failed to fetch actor credits. Status code: {response.status_code}")

def listActorMoviesAndTvShows(name):
    '''Prints a list of every movie/TV show the specified actor has played in'''
    try:
        id = getActorId(name)
        credits = getActorCredits(id)

        print(f"Movies and TV shows {name} has played in:")
        for credit in credits:
            title = credit['title'] if 'title' in credit else credit['name']
            print(f"- {title} ({credit['media_type']})")
    except ValueError as e:
        print(e)

def getMovieOrTvShowId(title, media_type='movie'):
    '''Returns the specified movie/TV show's ID'''
    searchUrl = f'{os.getenv("BASE_URL")}search/{media_type}'
    params = {
        'api_key': os.getenv("API_KEY"),
        'query': title
    }

    response = requests.get(searchUrl, params=params)

    if response.status_code == 200:
        data = response.json()
        if data['results']:
            return data['results'][0]['id']
        else:
            raise ValueError(f"{media_type.capitalize()} '{title}' not found.")
    else:
        raise ValueError(f"Failed to fetch {media_type} details. Status code: {response.status_code}")

def getMovieOrTvShowCredits(media_type, media_id):
    '''Returns list of every actor that played in a specified movie/TV show'''
    creditsUrl = f'{os.getenv("BASE_URL")}{media_type}/{media_id}/credits'
    params = {
        'api_key': os.getenv("API_KEY")
    }

    response = requests.get(creditsUrl, params=params)

    if response.status_code == 200:
        data = response.json()
        return data['cast']
    else:
        raise ValueError(f"Failed to fetch {media_type} credits. Status code: {response.status_code}")

def listActorsInMovieOrTvShow(title, media_type):
    '''Prints a list of every actors that played in a specified movie/TV show'''
    try:
        mediaId = getMovieOrTvShowId(title, media_type)
        credits = getMovieOrTvShowCredits(media_type, mediaId)

        print(f"Actors in '{title}' ({media_type}):")
        for actor in credits:
            actorName = actor['name']
            characterName = actor['character']
            print(f"- {actorName} as {characterName}")
    except ValueError as e:
        print(e)