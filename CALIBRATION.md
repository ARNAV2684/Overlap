# Calibration

The generator is tuned so its output matches **public, aggregate** real-football statistics. Every target below must
cite a public source before it's used for tuning. No match-level real data is used anywhere, not even for
calibration.

**How to use this file:**
1. Add or update a target with its public source (a link plus what it says).
2. Generate a synthetic season, run the realism report and record the measured value.
3. Mark the row `ok` when the measured value is inside the target range; otherwise tune and repeat.

**Status values:** `sourced` (public source found, ready for tuning), `weak source` (a source exists but is partial,
old or second-hand; usable with care), `needs source` (not used for tuning until a source is added), `ok` (measured
value inside the range).

## Match totals

| Metric | Target range | Public source | Measured (synthetic season) | Status |
|---|---|---|---|---|
| Goals per match | 2.7–3.3 | Premier League: 2.85 per match in 2022/23 and a record 3.28 in 2023/24 ([premierleague.com](https://www.premierleague.com/news/4027257)) | — | sourced |
| Shots per match (both teams) | 25–28 | Premier League: 27.60 shots per 90 in 2023/24, the most in about a decade ([premierleague.com](https://www.premierleague.com/news/4027257)); Opta: 27.2 ([The Analyst](https://theanalyst.com/2024/03/numbers-behind-premier-league-goal-explosion/)) | — | sourced |
| Shot conversion (goals ÷ shots, incl. blocked) | 10–12 % | Premier League: about 10.3 % on average since 2003/04, a record 11.88 % in 2023/24 ([premierleague.com](https://www.premierleague.com/news/4027257)) | — | sourced |
| Passes per match (both teams) | 820–950 | Premier League passing table: 881.7 per game in 2016/17, peak 945.2 in 2020/21, 849.1 in 2025/26 so far ([premierleague.com](https://www.premierleague.com/en/news/4426039/opta-analyst-on-long-balls-long-throws-key-tactical-trends-spotted-in-2025-26-season)) | — | sourced |
| Pass completion (all passes) | 79–84 % | Same table: 78.9 % in 2016/17 to 83.7 % in 2024/25 ([premierleague.com](https://www.premierleague.com/en/news/4426039/opta-analyst-on-long-balls-long-throws-key-tactical-trends-spotted-in-2025-26-season)) | — | sourced |
| Short-pass completion | ~88–90 % | _needs source_ | — | needs source |
| Fouls per team per match | 9–14 | About 10.8 per side per match ([Football Faithful](https://thefootballfaithful.com/clubs-worst-disciplinary-records-premier-league/), season unclear); referees averaging about 21 per match in 2025/26 ([Squawka](https://www.squawka.com/en/?p=1340370)) | — | weak source |
| Yellow cards per match | 3–5 | Opta: every season from 1994/95 to 2022/23 had 2.7–3.7 yellows per game; recent seasons higher, 4.7–5.1 early in 2023/24 and 2024/25 ([The Analyst](https://theanalyst.com/2024/10/do-premier-league-suspension-rules-need-changing)) | — | sourced |
| Offsides per team per match | 1–3 | Offsides fell over 10 seasons and after VAR, fewer in England than Germany or Spain, but no per-match figure given ([Frontiers in Psychology, 2021](https://www.frontiersin.org/articles/10.3389/fpsyg.2021.719270/full)) | — | needs source |
| Home win / draw / away win share | 42–49 % / 22–28 % / 28–33 % | Home win rate 47.6 % (2018/19), 45.3 % (2019/20), 37.9 % (2020/21, behind closed doors), 42.9 % (2021/22) ([premierleague.com](https://premierleague.com/news/2916832)); away win rate up to about 31 % ([Between the Lines](https://www.radioroyal.org/news/sport/home-advantage-is-on-the-wane-in-the-premier-league-and8211-between-the-lines)) | — | sourced (draw share is the remainder) |
| Total match length (with added time) | 99–103 min | Premier League: average match time 101:42 in 2023/24, up from 98:27 ([premierleague.com](https://www.premierleague.com/news/3860720)) | — | sourced |

## Shots and xG

| Metric | Target range | Public source | Measured | Status |
|---|---|---|---|---|
| Penalty xG | 0.78 | Opta assigns every penalty 0.78 because about 78 % are scored historically; 81.9 % were scored over 2020/21–2023/24 ([The Analyst](https://theanalyst.com/2024/05/premier-league-penalties-like-free-goal)) | — | sourced |
| Six-yard box, foot vs header | foot about 0.40; header under 0.25 | StatsBomb: like for like, headers from inside the six-yard box convert under 25 % against about 40 % for shots ([StatsBomb](https://blogarchive.statsbomb.com/articles/soccer/how-do-headers-compare-to-shots/)) | — | sourced |
| Headers overall | close to their xG | MLS 2011–2015: 723 headed goals from 715.67 xG ([American Soccer Analysis](https://www.americansocceranalysis.com/home/2016/10/18/is-finishing-real-heading-towards-a-conclusion)) | — | sourced |
| Central shot from about 11–12 m (open play) | ~0.3 | _needs source_ | — | needs source |
| Edge of the box, central | ~0.06–0.08 | _needs source_ | — | needs source |
| From 25 m or more | ~0.02–0.03 | Long-range shooting analysis ([StatsBomb](https://blogarchive.statsbomb.com/articles/soccer/mythbusting-is-long-range-shooting-a-bad-option/)); exact figure to confirm from the article | — | weak source |
| Weak-foot shots | below their xG | Secondary summary of an xG paper: strong-foot shots beat xG, weak-foot shots fall short ([The xG Football Club](https://thexgfootballclub.substack.com/p/the-perfect-xg-model-does-not-exist)) | — | weak source |
| Passes with the weaker foot | about 14 % | Carey et al. (2001), France 1998, as cited in a StatsBomb paper ([StatsBomb](https://blogarchive.statsbomb.com/uploads/2024/09/SB_Mark-Carter-paper.pdf)) | — | weak source |

## Physical

| Metric | Target range | Public source | Measured | Status |
|---|---|---|---|---|
| Sprint threshold | 25 km/h (25.2 in most studies) | GNSS study of elite players using the 25.2 km/h absolute threshold ([Biology of Sport, 2024](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11167479/)) | — | sourced |
| Top sprint speed | 33–36 km/h | Same study: peak match speed 32.9 ± 1.4 km/h ([Biology of Sport, 2024](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11167479/)); Premier League players among Europe's fastest ([Training Ground Guru](https://trainingground.guru/articles/premier-league-pushes-european-speed-limits-again)) | — | sourced |
| Distance covered, outfield player | 9–14 km (central midfielders about 10–12) | Players usually cover 9–14 km per match, 2–3 % of it above 25 km/h ([Biology of Sport, 2024](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11167479/)) | — | sourced |

## Players

| Metric | Target range | Public source | Measured | Status |
|---|---|---|---|---|
| Left-footed share of a squad | 20–27 %; two-footed players rare | France 1998: about 79 % of 236 World Cup players right-footed, nearly all the rest left-footed, very few using both feet equally (Carey et al. 2001, *Journal of Sports Sciences* 19(11), [University of Kent repository](https://kar.kent.ac.uk/4164/)); left-footers 26.5 % of 7,507 senior players picked by five European national teams (Tufo et al., [University of Turin repository](https://iris.unito.it/handle/2318/2126030)) | — | sourced |

## Conditions (small effects; judgement calls are labelled)

| Effect | Size | Public source | Status |
|---|---|---|---|
| Home advantage shrinks without a crowd | Scale home advantage with attendance | Systematic review of 26 studies of matches played without crowds ([Management Review Quarterly, 2021](https://link.springer.com/10.1007/s11301-021-00254-5)) | sourced |
| Heat reduces distance covered | Up to 15 % faster stamina drain above 25 °C | Warmer temperatures linked with more correct passes and less total distance ([JUMP journal](https://revistaselectronicas.ujaen.es/index.php/JUMP/article/download/5853/5566/29239)) | sourced (size is a judgement call) |
| Wet pitch: faster ground passes, slightly worse touch, keeper handling errors | About 2–5 % | No football study found | judgement call |
| Wind above 8 m/s: long balls, crosses and long shots less accurate | Weight × 0.8 for long balls | No football study found | judgement call |

## Realism report

The generator's batch mode will produce a report comparing each measured value with its target range, with
charts. A link to the latest report goes here.
