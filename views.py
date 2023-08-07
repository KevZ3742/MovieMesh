from flask import Blueprint, render_template, request, jsonify
import requests
import os
from utils import *

views = Blueprint(__name__, "views")

@views.route("/")
def home():
    test = request.args.get('query')
    return render_template("index.html", query=test)

# MovieMesh search API
@views.route('/api/search')
def fetch_search_results():
    query = request.args.get('query')
    
    if not query:
        return jsonify([])

    url = os.getenv("BASE_URL") + "search/multi"
    params = {
        "api_key": os.getenv("API_KEY"),
        "query": query,
    }

    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json().get("results", [])
        
        allowedKeys = ["media_type", "poster_path", "title", "name", "profile_path", "first_air_date", "release_date", "overview", "known_for_department"]
        
        return jsonify(dataCleaner(data, allowedKeys))
    except requests.RequestException as e:
        print("Error fetching data:", e)
        return jsonify([])