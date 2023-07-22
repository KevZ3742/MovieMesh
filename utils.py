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