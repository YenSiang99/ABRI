"""Downloads every Overture Maps place in the Klang Valley and flattens it to
NDJSON for overture.mjs to map. Split in two because reading Overture's
GeoParquet off S3 needs DuckDB, and everything else in these scripts is Node.

    pip3 install --user duckdb
    python3 scripts/sources/overture_fetch.py [release]    # e.g. 2026-09-23.1
    node scripts/sources/overture.mjs

Overture Places is CDLA-Permissive-2.0 (a few upstream rows are Apache-2.0
from Foursquare or CC0 from AllThePlaces) — commercial reuse allowed with
attribution, no share-alike. Each row's upstream datasets are kept so that
attribution can be exact.

No credentials: the bucket is public and read anonymously.
"""

import json
import os
import sys
import urllib.request
import re

import duckdb

KV = dict(west=101.35, east=101.85, south=2.75, north=3.35)
BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com"

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "..", "..", "data", "sources", "overture", "raw")


def latest_release():
    xml = urllib.request.urlopen(
        f"{BUCKET}/?list-type=2&prefix=release/&delimiter=/", timeout=30
    ).read().decode()
    releases = sorted(re.findall(r"release/([^/<]+)/", xml))
    return releases[-1]


def main():
    os.makedirs(RAW, exist_ok=True)
    release = sys.argv[1] if len(sys.argv) > 1 else latest_release()
    parquet = os.path.join(RAW, f"kv_places_{release}.parquet")
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")

    if not os.path.exists(parquet):
        print(f"Downloading Klang Valley places from Overture {release} …")
        src = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
        con.execute(f"""
            COPY (
              SELECT * FROM read_parquet('{src}', hive_partitioning=1)
              WHERE bbox.xmin BETWEEN {KV['west']} AND {KV['east']}
                AND bbox.ymin BETWEEN {KV['south']} AND {KV['north']}
            ) TO '{parquet}' (FORMAT parquet)
        """)

    out = os.path.join(RAW, "kv_places.ndjson")
    # Only the fields overture.mjs uses. Phones and emails are deliberately
    # not exported at all — they are never written to a listing.
    rows = con.execute(f"""
        SELECT
          id,
          names.primary                    AS name,
          confidence,
          operating_status,
          brand.names.primary              AS brand,
          taxonomy.primary                 AS category,
          taxonomy.hierarchy               AS hierarchy,
          websites,
          addresses[1].freeform            AS street,
          addresses[1].locality            AS locality,
          addresses[1].postcode            AS postcode,
          list_distinct([s.dataset for s in sources]) AS datasets,
          list_max([s.update_time for s in sources])  AS updated,
          (bbox.ymin + bbox.ymax) / 2      AS lat,
          (bbox.xmin + bbox.xmax) / 2      AS lon
        FROM '{parquet}'
    """)
    cols = [d[0] for d in rows.description]
    n = 0
    with open(out, "w") as f:
        for r in rows.fetchall():
            f.write(json.dumps(dict(zip(cols, r)), default=str) + "\n")
            n += 1
    with open(os.path.join(RAW, "release.txt"), "w") as f:
        f.write(release)
    print(f"Wrote {n} places to {os.path.relpath(out)} (release {release})")


if __name__ == "__main__":
    main()
