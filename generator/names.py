# names.py — Name pools
#
# Purpose: regional name pools and a seeded draw; keep player names invented and unique; check reference names
#          are not recognisable
# Inputs:  a random stream; every club's players; optionally the private reference mapping (never committed)
# Outputs: drawn names; problems found
# Spec:    generator/specs/world.md §5

from __future__ import annotations

import random
import unicodedata
from collections import Counter
from pathlib import Path

import yaml

MIN_EDIT_DISTANCE = 4  # between a reference name and the real name it is modelled on
PRIVATE_MAP = Path(__file__).with_name("reference_map.private.yaml")
DENYLIST = Path(__file__).with_name("name_denylist.private.txt")  # well-known real full names, one per line
HOME_SHARE = 0.5         # about half a squad comes from the club's one or two home regions (world.md §5)

# First names and surnames per region (world.md §5). Common names only; a first name and a surname are drawn
# separately, so most pairs are new.
REGIONS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "british_irish": (
        ("Aaron", "Adam", "Ben", "Callum", "Cian", "Conor", "Dan", "Declan", "Ewan", "Finn", "Fraser", "George",
         "Harry", "Jack", "Jamie", "Joe", "Josh", "Kieran", "Lewis", "Liam", "Luke", "Matt", "Niall", "Oisin",
         "Owen", "Rhys", "Rory", "Ryan", "Sam", "Tom"),
        ("Ashworth", "Bramley", "Calder", "Cardwell", "Coyle", "Dunleavy", "Ellery", "Fenwick", "Garside", "Gilmour",
         "Hackett", "Haworth", "Holloway", "Kearney", "Kinsella", "Lockhart", "Maddox", "McAlister", "McGowan",
         "Moorcroft", "Nolan", "Ormsby", "Pennock", "Quinlan", "Rawcliffe", "Rowntree", "Sheridan", "Tolan",
         "Thursby", "Wainwright", "Whitlock", "Yardley")),
    "iberian_latin": (
        ("Alejandro", "Álvaro", "Andrés", "Bruno", "Diego", "Emiliano", "Facundo", "Gonzalo", "Hugo", "Iker",
         "Joaquín", "Matías", "Leandro", "Mateo", "Miguel", "Nicolás", "Pablo", "Rafael", "Rodrigo", "Santiago",
         "Sergio", "Thiago", "Tomás", "Vicente", "João", "Gustavo", "Renan", "Caio", "Diogo", "Rúben"),
        ("Aranda", "Barrios", "Cabral", "Cardozo", "Castaño", "Cuevas", "Duarte", "Echeverri", "Ferreyra", "Galindo",
         "Ibáñez", "Lezcano", "Lozada", "Medina", "Montero", "Navarrete", "Ocampo", "Pereyra", "Quintana", "Rebelo",
         "Salgado", "Sarmiento", "Tavares", "Valdés", "Villalba", "Zamora", "Bastos", "Fontes", "Gouveia", "Mourão")),
    "french": (
        ("Adrien", "Alexis", "Antoine", "Baptiste", "Bastien", "Clément", "Corentin", "Dorian", "Enzo", "Florian",
         "Hugo", "Jordan", "Julien", "Arthur", "Loïc", "Lucas", "Mathis", "Maxime", "Nathan", "Quentin", "Rayan",
         "Romain", "Théo", "Tristan", "Valentin", "Yanis", "Bilal", "Mehdi", "Noah", "Gaëtan"),
        ("Arnaud", "Barbier", "Bessard", "Bonnard", "Carpentier", "Chevalier", "Delorme", "Duval", "Fabre", "Gauthier",
         "Guérin", "Hamon", "Joubert", "Labbé", "Lacroix", "Lemaire", "Marchand", "Masson", "Morel", "Perrin",
         "Poirier", "Renaud", "Roussel", "Tessier", "Vasseur", "Vidal", "Brunet", "Collin", "Leclerc", "Mallet")),
    "west_african": (
        ("Abdou", "Ade", "Amadou", "Babajide", "Cheikh", "Chinedu", "Daouda", "Emeka", "Ibrahima", "Kossi",
         "Ebrima", "Kelechi", "Kofi", "Kwame", "Abdoulaye", "Mamadou", "Moussa", "Nnamdi", "Obinna", "Ousmane",
         "Samba", "Seydou", "Sekou", "Tunde", "Yaw", "Yusuf", "Kwabena", "Femi", "Bakary", "Idrissa"),
        ("Adeyemi", "Agyemang", "Akinola", "Asante", "Badji", "Bamba", "Camara", "Coulibaly", "Dossou", "Diatta",
         "Danjuma", "Eze", "Fofana", "Gbadamosi", "Kanouté", "Kouassi", "Kone", "Mensah", "Ndiaye", "Nwosu", "Obi",
         "Okafor", "Okonkwo", "Owusu", "Sarr", "Sanogo", "Touré", "Traoré", "Yeboah", "Sangaré")),
    "central_eastern": (
        ("Adrian", "Aleksandar", "Bartosz", "Damian", "Dominik", "Filip", "Igor", "Ivan", "Jakub", "Kamil", "Karol",
         "Luka", "Marek", "Marko", "Matej", "Mateusz", "Milan", "Nikola", "Ondřej", "Patrik", "Petr", "Stefan",
         "Tomáš", "Vlad", "Vuk", "Andrei", "Bogdan", "Lukas", "Mihai", "Denis"),
        ("Bartos", "Bielski", "Dvořák", "Horvat", "Jankowski", "Kovač", "Krejčí", "Kowalczyk", "Lukić", "Marić",
         "Mazur", "Nemeth", "Novak", "Pavlović", "Petrović", "Popescu", "Radu", "Sobczak", "Stanković", "Szabó",
         "Tomić", "Vasić", "Wójcik", "Zieliński", "Kral", "Babić", "Ionescu", "Varga", "Šimek", "Jurić")),
    "nordic": (
        ("Anders", "Axel", "Bjørn", "Elias", "Emil", "Erik", "Filip", "Gustav", "Henrik", "Isak", "Jesper", "Jonas",
         "Kasper", "Lars", "Magnus", "Mikkel", "Nils", "Oskar", "Rasmus", "Sander", "Sindre", "Tobias", "Viktor",
         "Aksel", "Eirik", "Joel", "Linus", "Mads", "Oliver", "Teemu"),
        ("Aasen", "Berglund", "Brekke", "Dahl", "Ekström", "Engström", "Fjeld", "Halvorsen", "Hedlund", "Holmberg",
         "Isaksen", "Jensen", "Karlsson", "Kristiansen", "Lindqvist", "Lund", "Mikkelsen", "Nyberg", "Olsen",
         "Rasmussen", "Sandvik", "Solvik", "Strand", "Sundqvist", "Thorsen", "Vik", "Virtanen", "Wikström",
         "Lehtonen", "Haugen")),
    "italian": (
        ("Alessandro", "Andrea", "Antonio", "Davide", "Edoardo", "Emanuele", "Fabio", "Federico", "Filippo",
         "Francesco", "Gabriele", "Giacomo", "Giorgio", "Lorenzo", "Luca", "Manuel", "Marco", "Matteo", "Mattia",
         "Nicolò", "Pietro", "Riccardo", "Roberto", "Salvatore", "Simone", "Stefano", "Tommaso", "Valerio",
         "Vincenzo", "Daniele"),
        ("Amato", "Barone", "Bellini", "Bianchi", "Caruso", "Colombo", "Cattaneo", "De Luca", "Esposito", "Fabbri",
         "Ferraro", "Gualtieri", "Gentile", "Greco", "Lombardi", "Longo", "Mancuso", "Marino", "Moretti", "Orlando",
         "Palumbo", "Rinaldi", "Rinaudo", "Santoro", "Serra", "Testa", "Valentini", "Vitale", "Ruggiero", "Sartori")),
    "dutch_german": (
        ("Bas", "Daan", "Dennis", "Florian", "Jannik", "Jasper", "Jonas", "Julian", "Kai", "Lars", "Lennart",
         "Levi", "Luuk", "Malte", "Marvin", "Max", "Moritz", "Niklas", "Pascal", "Rick", "Ruben", "Sem", "Stijn",
         "Thijs", "Timo", "Tobias", "Wout", "Yannick", "Jens", "Fabian"),
        ("Bakker", "Becker", "Bergmann", "de Graaf", "de Wit", "Dekker", "Fischer", "Hartmann", "Hellmann", "Jansen",
         "Kaiser", "Keller", "Koch", "Krüger", "Lange", "Molenaar", "Mulder", "Peters", "Schmitz", "Schröder",
         "Smit", "van Dam", "van Leeuwen", "Visser", "Vogel", "Wagner", "Weber", "Winter", "Zimmermann", "Bosman")),
    "middle_east_south_asia": (
        ("Adil", "Amir", "Arjun", "Ayaan", "Bilal", "Danish", "Farid", "Hamza", "Hassan", "Imran", "Ismail",
         "Kabir", "Karim", "Khalid", "Mehmet", "Nabil", "Omar", "Rahim", "Rami", "Rohan", "Sami", "Tariq", "Yasin",
         "Zaid", "Zayan", "Emre", "Kerem", "Arda", "Navid", "Reza"),
        ("Aziz", "Bashir", "Chaudhari", "Durmaz", "Farouk", "Haddad", "Habibi", "Hussain", "Iqbal", "Jaber",
         "Kapoor", "Karimi", "Khalil", "Malik", "Mansour", "Mirza", "Nasser", "Qureshi", "Rahman", "Saleh",
         "Sayed", "Sharif", "Siddiqui", "Tahir", "Yilmaz", "Zaman", "Aydın", "Kaya", "Rostami", "Sabri")),
}


def club_regions(rng: random.Random) -> tuple[str, ...]:
    """One or two home regions for a club, picked with the seed."""
    regions = sorted(REGIONS)
    return tuple(rng.sample(regions, rng.choice((1, 2))))


def draw_name(rng: random.Random, region: str, taken_full: set[str], taken_surnames: set[str]) -> str:
    """A first name and a surname from one region, new in the world and its surname new in the club."""
    firsts, lasts = REGIONS[region]
    for _ in range(200):
        name = f"{rng.choice(firsts)} {rng.choice(lasts)}"
        if fold(name) not in taken_full and fold(surname(name)) not in taken_surnames:
            taken_full.add(fold(name))
            taken_surnames.add(fold(surname(name)))
            return name
    raise ValueError(f"name pool {region} has nothing left")


def squad_regions(rng: random.Random, home: tuple[str, ...], n: int) -> list[str]:
    """A region for each of `n` players: about half from the home regions, the rest from anywhere else."""
    others = sorted(set(REGIONS) - set(home))
    return [rng.choice(home) if rng.random() < HOME_SHARE else rng.choice(others) for _ in range(n)]


def fold(name: str) -> str:
    """Lower case, accents removed, so 'Šimunić' and 'simunic' compare equal."""
    decomposed = unicodedata.normalize("NFKD", name)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold().strip()


def surname(name: str) -> str:
    return name.split()[-1]


def edit_distance(a: str, b: str) -> int:
    a, b = fold(a), fold(b)
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, cb in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (ca != cb))
    return row[-1]


def duplicate_problems(players: list[tuple[str, str]]) -> list[str]:
    """`players` is (team_id, full name). Full names are unique in the world; surnames are unique in a club."""
    problems = []
    full = Counter(fold(name) for _, name in players)
    for name, n in sorted(full.items()):
        if n > 1:
            problems.append(f"name used {n} times in the world: {name}")
    by_club = Counter((team_id, fold(surname(name))) for team_id, name in players)
    for (team_id, last), n in sorted(by_club.items()):
        if n > 1:
            problems.append(f"{team_id}: surname used {n} times: {last}")
    return problems


def load_private_map(path: Path = PRIVATE_MAP) -> dict | None:
    """The real names behind the reference profiles, or None when the file isn't on this machine."""
    if not path.exists():
        return None
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def reference_name_problems(players: list[tuple[str, int, str]], private_map: dict) -> list[str]:
    """`players` is (team_id, shirt, invented name). Never prints the real name, only the invented one."""
    problems = []
    for team_id, shirt, invented in players:
        real = private_map.get(team_id, {}).get("players", {}).get(shirt)
        if real is None:
            continue
        if fold(surname(invented)) == fold(surname(real)):
            problems.append(f"{team_id}-{shirt:02d} {invented}: shares a surname with the real player")
        elif edit_distance(invented, real) < MIN_EDIT_DISTANCE:
            problems.append(f"{team_id}-{shirt:02d} {invented}: fewer than {MIN_EDIT_DISTANCE} edits from the real name")
    return problems


def load_denylist(path: Path = DENYLIST) -> set[str] | None:
    """Folded well-known real full names, or None when the file isn't on this machine (world.md §5)."""
    if not path.exists():
        return None
    lines = path.read_text(encoding="utf-8").splitlines()
    return {fold(line) for line in lines if line.strip() and not line.lstrip().startswith("#")}


def denylist_problems(players: list[tuple[str, str]], denylist: set[str]) -> list[str]:
    """`players` is (team_id, full name). Names the player, never the list's entry."""
    return [f"{team_id}: {name} matches a well-known real name; change the name pools"
            for team_id, name in players if fold(name) in denylist]
