import json

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