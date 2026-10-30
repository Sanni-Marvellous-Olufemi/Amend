import os

os.environ["AMEND_MOCK"] = "1"
# Set (not unset) so a developer's backend/.env from `make key` can't fill it back in:
# config only loads .env values for variables that aren't already set.
os.environ["AMEND_EXTENSION_ID"] = ""
