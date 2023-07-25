from flask import Blueprint, render_template, request

views = Blueprint(__name__, "views")

@views.route("/")
def home():
    test = request.args.get('query')
    print(request.args)
    return render_template("index.html", query=test)