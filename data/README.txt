Put catalog.db here (data/catalog.db).

Build it with:  python build_catalog.py path/to/ml-32m
(run explore_ratings.py first, from the same folder, so seasonal_movies.csv gets included)

Ratings are read from ratings.csv by default (a few extra minutes). Only pass --no-ratings if you really
want to skip them: every movie then has no rating data, so the "Rating" part of the watch score (the
biggest one) stays empty and "similar movies" lose their popularity ranking.
