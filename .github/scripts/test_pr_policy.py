"""Unit tests for pr_policy.py. Run: python -m unittest discover -s .github/scripts"""

import unittest

import pr_policy as P

TEMPLATE_OK = """## What changed

Adds the world builder.

## Which layer(s)

- [x] Generator
- [ ] Web app

## Contracts

- [x] No message shapes changed
- [ ] Message shapes changed

## How to test

uv run pytest
"""

REGISTRY = """# Registry

## Layer owners

| Layer | Folder(s) | Owner(s) |
|---|---|---|
| 1 · Synthetic generator | `generator/`, `CALIBRATION.md` | Azeem |
| 7 · Web app | `web/` | Vedant |

## Hot shared files

| File or folder | Why it is shared | Tell before changing |
|---|---|---|
| `CONTRACTS.md` | Every message | The producer and consumer owners |
| `README.md`, `CONTRIBUTING.md` | Everyone reads them | Arnav |
"""


class AiAttribution(unittest.TestCase):
    def test_generated_footer(self):
        self.assertTrue(P.ai_findings("Fix bug\n\nGenerated with SomeTool", []))

    def test_robot_emoji_footer(self):
        self.assertTrue(P.ai_findings("body\n\n\U0001F916 made by a tool", []))

    def test_session_trailer_and_link(self):
        self.assertTrue(P.ai_findings("X-Session: https://example.com/code/sessions/abc", []))

    def test_machine_co_author(self):
        self.assertTrue(P.ai_findings("Add x\n\nCo-Authored-By: Bot <noreply@vendor.example>", []))

    def test_human_co_author_allowed(self):
        msg = "Add x\n\nCo-authored-by: Pat <123+pat@users.noreply.github.com>"
        self.assertEqual(P.ai_findings(msg, []), [])

    def test_meta_term_co_author(self):
        msg = "Co-authored-by: Helper <123+helperbot@users.noreply.github.com>"
        self.assertTrue(P.ai_findings(msg, ["helperbot"]))

    def test_plain_message(self):
        self.assertEqual(P.ai_findings("Add possession model\n\nExplain why.", []), [])

    def test_word_generated_mid_sentence_is_fine(self):
        self.assertEqual(P.ai_findings("Seeds are generated deterministically.", []), [])


class Branches(unittest.TestCase):
    def test_good(self):
        for b in ("generator/world-builder", "ci/pr-checks", "mock/live-feed", "contracts/event-hubs-transport"):
            self.assertTrue(P.branch_ok(b), b)

    def test_bad(self):
        for b in ("feature-x", "Generator/World", "random/thing", "main"):
            self.assertFalse(P.branch_ok(b), b)


class Template(unittest.TestCase):
    def test_filled(self):
        self.assertEqual(P.template_problems(TEMPLATE_OK), [])

    def test_empty_sections(self):
        body = TEMPLATE_OK.replace("Adds the world builder.", "<!-- One or two sentences. -->")
        body = body.replace("uv run pytest", "<!-- Steps a reviewer can follow. -->")
        problems = P.template_problems(body)
        self.assertIn("'What changed' is empty", problems)
        self.assertIn("'How to test' is empty", problems)

    def test_nothing_ticked(self):
        body = TEMPLATE_OK.replace("- [x] Generator", "- [ ] Generator").replace("- [x] No message", "- [ ] No message")
        problems = P.template_problems(body)
        self.assertTrue(any("layer" in p for p in problems))
        self.assertTrue(any("Contracts" in p for p in problems))

    def test_missing(self):
        self.assertIn("the PR template is missing", P.template_problems("just text"))


class Identity(unittest.TestCase):
    def test_noreply_matches_author(self):
        c = P.Commit("a" * 40, "Pat", "1+pat@users.noreply.github.com", "m")
        self.assertEqual(P.identity_problems([c], "pat"), [])

    def test_personal_email_warns(self):
        c = P.Commit("a" * 40, "Pat", "pat@example.com", "m")
        self.assertTrue(P.identity_problems([c], "pat"))

    def test_other_author_warns(self):
        c = P.Commit("a" * 40, "Sam", "2+sam@users.noreply.github.com", "m")
        self.assertTrue(P.identity_problems([c], "pat"))


class Blocklist(unittest.TestCase):
    def test_parse_scopes(self):
        terms = P.parse_blocklist("# comment\nAlpha Club\n\nmeta:toolname\n")
        self.assertEqual(terms, [("all", "Alpha Club"), ("meta", "toolname")])

    def test_word_boundaries(self):
        self.assertTrue(P.term_match("opta", "data from Opta feeds"))
        self.assertFalse(P.term_match("opta", "we adopta new style"))
        self.assertTrue(P.term_match("Alpha Club", "alpha club plays"))


class Registry(unittest.TestCase):
    def test_parse(self):
        reg = P.parse_registry(REGISTRY)
        self.assertEqual([l[0] for l in reg.layers], ["1 · Synthetic generator", "7 · Web app"])
        self.assertEqual(reg.layers[0][1], ["generator/", "CALIBRATION.md"])
        self.assertEqual(reg.hot[1], (["README.md", "CONTRIBUTING.md"], "Arnav"))

    def test_path_matches(self):
        self.assertTrue(P.path_matches("generator/world.py", "generator/"))
        self.assertTrue(P.path_matches("CALIBRATION.md", "CALIBRATION.md"))
        self.assertTrue(P.path_matches("mock/overlap_mock/engine.py", "mock/overlap_mock/*.py"))
        self.assertTrue(P.path_matches("web/src/lib/contracts.ts", "web/src/lib/contracts.ts"))
        self.assertFalse(P.path_matches("generators/x.py", "generator/"))


class SpecsAndPlans(unittest.TestCase):
    def test_spec_status(self):
        self.assertEqual(P.spec_status("# X\n\n> **Status: not started.** Write it."), "not started")
        self.assertEqual(P.spec_status("> **Status: draft for review.** Plan: …"), "draft for review")
        self.assertEqual(P.spec_status("> **Status: agreed.**"), "agreed")
        self.assertIsNone(P.spec_status("no marker"))

    def test_spec_of(self):
        self.assertEqual(P.spec_of("# world.py\n#\n# Spec:    generator/specs/world.md\n"), "generator/specs/world.md")
        self.assertEqual(P.spec_of("// Spec:    web/specs/screens.md"), "web/specs/screens.md")
        self.assertIsNone(P.spec_of("print('hi')"))

    def test_plan_fields(self):
        quick = "| Status | In progress |\n| Branch | `mock/live-feed` |\n\n| File | Add |\n|---|---|\n| `mock/README.md` | Add |\n"
        self.assertEqual(P.plan_branch(quick), "mock/live-feed")
        self.assertEqual(P.plan_status(quick), "In progress")
        self.assertIn("mock/README.md", P.plan_files(quick))


if __name__ == "__main__":
    unittest.main()
