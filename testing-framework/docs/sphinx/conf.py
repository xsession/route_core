# -- Industrial Test Framework — Sphinx Configuration --
# Enterprise-grade documentation for the universal GUI testing framework.

import os
import sys
from datetime import date

# -- Project information -------------------------------------------------------

project = "Industrial Test Framework"
copyright = f"{date.today().year}, Industrial Test Framework Contributors"
author = "Industrial Test Framework Contributors"
version = "0.1.0"
release = "0.1.0"

# -- General configuration -----------------------------------------------------

extensions = [
    "sphinx.ext.autodoc",
    "sphinx.ext.intersphinx",
    "sphinx.ext.todo",
    "sphinx.ext.viewcode",
    "sphinx.ext.graphviz",
    "sphinx.ext.ifconfig",
    "sphinx_rtd_theme",
    "sphinx_copybutton",
    "sphinxcontrib.mermaid",
    "sphinx.ext.duration",
]

templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]
source_suffix = ".rst"
master_doc = "index"
language = "en"

# -- Options for HTML output ---------------------------------------------------

html_theme = "sphinx_rtd_theme"
html_static_path = ["_static"]
html_logo = None
html_favicon = None

html_theme_options = {
    "logo_only": False,
    "display_version": True,
    "prev_next_buttons_location": "bottom",
    "style_external_links": True,
    "collapse_navigation": False,
    "sticky_navigation": True,
    "navigation_depth": 4,
    "includehidden": True,
    "titles_only": False,
}

html_context = {
    "display_github": True,
    "github_user": "your-org",
    "github_repo": "industrial-test-framework",
    "github_version": "main",
    "conf_py_path": "/docs/sphinx/",
}

# -- Options for LaTeX output --------------------------------------------------

latex_elements = {
    "papersize": "a4paper",
    "pointsize": "11pt",
    "preamble": r"\usepackage{enumitem}\setlistdepth{99}",
}

latex_documents = [
    (
        master_doc,
        "IndustrialTestFramework.tex",
        "Industrial Test Framework Documentation",
        author,
        "manual",
    ),
]

# -- Extension configuration ---------------------------------------------------

todo_include_todos = True

intersphinx_mapping = {
    "python": ("https://docs.python.org/3", None),
}

# -- Custom CSS ----------------------------------------------------------------

def setup(app):
    app.add_css_file("custom.css")
