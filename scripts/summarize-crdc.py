"""Print only regional aggregates from the 2023–24 CRDC public-use ZIP."""
import argparse
from collections import Counter
import csv
import io
import json
from zipfile import ZipFile

STATES_AND_DC = set(
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split()
)
RACES = {
    "AM": "American Indian or Alaska Native",
    "AS": "Asian",
    "BL": "Black or African American",
    "HI": "Hispanic or Latino",
    "HP": "Native Hawaiian or Other Pacific Islander",
    "WH": "White",
    "TR": "Two or more races",
}
SEXES = {"F": "Female", "M": "Male"}
MINIMUM_PUBLIC_COUNT = 10


def summarize(path):
    counts = {"US": Counter(), "OH": Counter()}
    skipped = {"US": Counter(), "OH": Counter()}
    seen = set()
    with ZipFile(path) as archive:
        with io.TextIOWrapper(archive.open("SCH/Computer Science.csv"), encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                state = row["LEA_STATE"]
                if state not in STATES_AND_DC:
                    continue
                school = row["COMBOKEY"]
                if school in seen:
                    raise ValueError(f"Duplicate CRDC school key {school}")
                seen.add(school)
                if int(row["SCH_COMPCLASSES_CSCI"]) <= 0:
                    continue
                regions = ("US", "OH") if state == "OH" else ("US",)
                for race in RACES:
                    for sex in SEXES:
                        key = f"{race}_{sex}"
                        cell = row[f"SCH_COMPENR_CSCI_{key}"].strip()
                        value = int(cell) if cell else -1
                        for region in regions:
                            if value >= 0:
                                counts[region][key] += value
                            else:
                                skipped[region][key] += 1
    return {
        region: {
            key: {"count": count if count >= MINIMUM_PUBLIC_COUNT else None, "missing": skipped[region][key]}
            for key, count in group.items()
        }
        for region, group in counts.items()
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("crdc_zip")
    print(json.dumps(summarize(parser.parse_args().crdc_zip), indent=2))
