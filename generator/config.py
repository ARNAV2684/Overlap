# config.py — Tunable settings
#
# Purpose: keep every tunable number (base rates, multipliers, thresholds) in one place
# Inputs:  -
# Outputs: settings used by the engine and movement model
# Spec:    generator/specs/actions.md §6, CALIBRATION.md
#
# Each value is a starting point from the specs, tuned against CALIBRATION.md. A comment says what it moves.

from __future__ import annotations

# --- Time (engine.md §2, §4) -------------------------------------------------------------------------------------

STEP_MS = 200                       # one simulation step = one 5 Hz tracking frame
PERIOD_MS = 45 * 60 * 1000          # regulation length of a period
END_WINDOW_MS = 60_000              # a period ends at most this long after added time runs out
DECISION_DELAY_S = (0.6, 3.0)       # time on the ball before the next action
DEAD_TIME_S = {                     # dead-ball time before each restart (set-pieces-and-discipline.md, engine.md §4)
    "throw_in": (8, 18), "goal_kick": (15, 30), "corner": (25, 45), "kickoff_after_goal": (45, 75),
    "free_kick": (15, 30), "free_kick_near": (30, 45), "penalty": (60, 100), "card": (20, 40),
    "substitution": (25, 40),
}
ADDED_EXTRA_S = (0, 45)             # other stoppages folded into added time
ADDED_MIN_MINUTES = {1: 1, 2: 3}    # added time is never less than this
ADDED_MAX_MINUTES = 10

# --- Randomness (engine.md §7) -----------------------------------------------------------------------------------

STREAMS = ("conditions", "decisions", "outcomes", "discipline", "movement", "restarts", "storylines")

# --- Conditions (engine.md §9) -----------------------------------------------------------------------------------

DEFAULT_CAPACITY = 40_000           # until venues carry `capacity`
TEMPERATE_MEAN_C = {1: 5, 2: 5, 3: 7, 4: 9, 5: 12, 6: 15, 7: 17, 8: 17, 9: 15, 10: 11, 11: 8, 12: 6}
TEMPERATURE_SD_C = 3.0
PRECIPITATION_P = {"none": 0.62, "light": 0.28, "heavy": 0.10}
WIND_MEAN_MS = 5.0
ATTENDANCE_FILL = (0.85, 1.00)
HEAT_C = 25.0                       # above this, stamina drains faster
HEAT_DRAIN = 1.15
WET_ACCURACY_LOGIT = -0.10          # pass and touch accuracy on a wet pitch (judgement call)
WET_ROLL_SPEED = 1.05               # ground passes travel faster on a wet pitch
WINDY_MS = 8.0
WIND_LONG_WEIGHT = 0.8              # long passes, switches, crosses less often in wind
HOME_EDGE = 6                       # home side's boost to these ratings at a full house (scaled by attendance)
HOME_EDGE_ATTRIBUTES = ("passing", "finishing", "tackling", "composure")

# --- Pitch zones (actions.md §2), team-frame 0-100 ---------------------------------------------------------------

ZONE_X = (33.0, 66.0, 83.0)          # own third | middle | final third | box-depth
WIDE_Y = 18.0                        # y < 18 or > 82 is wide

# --- Decision weights (actions.md §2) ----------------------------------------------------------------------------

ACTIONS = ("short_pass", "long_pass", "through_ball", "cross", "cutback", "switch", "carry", "take_on", "shot",
           "clearance", "hold")
# Relative weights within a zone, in ACTIONS order. In the final third and box the shot weight is added from xG.
#                  short  long  thru  cross  cut  switch  carry  take  shot  clear  hold
_BASE_ROWS = {
    "own":           (60,   14,    3,    0,    0,    4,     12,    2,    0,    8,    4),
    "middle":        (55,   10,    8,    0,    0,    6,     16,    5,    0.3,  1,    4),
    "final_wide":    (38,    2,    6,    5,    3,    5,     14,   10,  0.5,    0,    5),
    "final_central": (40,    1,   11,    0,    0,    2,     12,    8,    2,    0,    4),
    "box":           (24,    0,    6,    4,    6,    0,      6,    8,    0,    0,    3),
}
BASE_WEIGHTS = {zone: dict(zip(ACTIONS, row)) for zone, row in _BASE_ROWS.items()}
SHOT_APPETITE = 33.0               # S in weight = S × xG / (SHOT_XG_HALF + xG); raises or lowers shots per match
SHOT_XG_HALF = 0.30                 # larger: the decision to shoot follows chance quality more closely
SHOT_FINISHING_POWER = 0.25          # shot weight × (finishing / 70) ** this (squared from over 20 m), so good finishers
                                     # shoot more without taking every chance
SHOT_DIRECTNESS_BASE = 0.2          # shot weight × (this + directness): direct sides shoot sooner
MIN_SHOT_XG = 0.02                   # never shoot below this
COUNTER_WINDOW_MS = 12_000           # after a regain in own half...
COUNTER_FROM_X = 50.0                # ...(team-frame percent): a high regain is a high turnover, not a counter
COUNTER_MIN_GAIN_PCT = 5.0           # a completed pass gaining less than this (team-frame percent) ends the counter
COUNTER_PRESS_MS = 5_000             # after losing the ball
COUNTER_RELEASE = 0.6                # decision delay × (1 - this × counter_attack) in the counter window
COUNTER_SHORT_CUT = 0.5             # short_pass × (1 - this × counter_attack) in the counter window
COUNTER_PROGRESS = 2.0               # pass-target progress × (1 + this × counter_attack) in the counter window
COUNTER_RUN_PCT = 12.0               # attackers push up this far (× counter_attack) on a counter

ROLE_WEIGHTS = {                     # role multipliers on the on-ball weights
    "sweeper_keeper": {"short_pass": 1.5, "long_pass": 0.6},
    "shot_stopper": {"long_pass": 1.5, "short_pass": 0.7},
    "ball_playing_cb": {"carry": 1.4, "long_pass": 1.3, "switch": 1.3, "clearance": 0.7},
    "stopper": {"clearance": 1.6, "carry": 0.6},
    "overlapping_fullback": {"cross": 1.5},
    "wing_back": {"cross": 1.5},
    "inverted_fullback": {"short_pass": 1.2, "cross": 0.6},
    "anchor": {"short_pass": 1.3, "take_on": 0.5},
    "deep_playmaker": {"long_pass": 1.5, "switch": 1.5, "through_ball": 1.5},
    "ball_winner": {"short_pass": 1.2, "through_ball": 0.7},
    "box_to_box": {"carry": 1.2},
    "playmaker": {"through_ball": 1.7, "cutback": 1.3},
    "inverted_winger": {"carry": 1.5, "cross": 0.7},
    "wide_winger": {"take_on": 1.4, "cross": 1.5},
    "wide_midfielder": {"cross": 1.2, "take_on": 0.8},
    "poacher": {"carry": 0.6},
    "target_man": {"hold": 2.0, "short_pass": 1.3},
    "pressing_forward": {},
}

# --- Pressing (actions.md §2) ------------------------------------------------------------------------------------

PRESS_RADIUS_M = 12.0
PRESSURE_RADIUS_M = 2.5
PRESSURE_REPEAT_MS = 3_000          # a Pressure event at most every 3 s per defender (engine.md §5 allows 1.5)
TACKLE_RADIUS_M = 1.3
TACKLE_RATE_PER_STEP = 0.021         # chance a defender in range tries a tackle each step (about 15-20 tackles a team)
MAX_PRESSERS = 2
MAX_COUNTER_PRESSERS = 3
PRESS_ROLE = {"ball_winner": 1.4, "pressing_forward": 1.4, "stopper": 1.3, "anchor": 0.7}

# --- Outcomes (actions.md §3) ------------------------------------------------------------------------------------

BASE_SUCCESS = {
    "short_pass": 0.97, "long_pass": 0.78, "through_ball": 0.50, "cross": 0.24, "cutback": 0.55, "switch": 0.70,
    "take_on": 0.48, "tackle": 0.55, "aerial": 0.50, "clearance": 0.35,
}
SKILL_LOGIT_PER = 15.0               # (rating - 70) / this, added to the log-odds
PRESSURE_LOGIT = -0.4
MARKED_RADIUS_M = 3.0                # a ground pass played to within this of an opponent...
MARKED_LOGIT = -0.8                  # ...loses up to this much log-odds (all of it with the opponent on the spot)
SHORT_PASS_LENGTH_LOGIT = -0.025     # per metre beyond 12 m
WEAK_FOOT_PASS_SHARE = 0.15          # passes made with the weaker foot
WEAK_FOOT_PASS_PENALTY = 0.03        # × (5 - weak_foot), on the success probability
WEAK_FOOT_SHOT_PENALTY = 0.05
INTERCEPT_RADIUS_M = 2.0
INTERCEPT_BASE = 0.30
LOOSE_OFFSET_M = (4.0, 10.0)         # how far an inaccurate pass lands from its target
TACKLE_POKE_LOOSE = 0.30             # share of won tackles that only poke the ball loose

# --- Ball (actions.md §5) ----------------------------------------------------------------------------------------

BALL_SPEED_KMH = {
    "short_pass": (35, 60), "long_pass": (55, 90), "through_ball": (40, 70), "cross": (60, 85), "cutback": (40, 60),
    "switch": (60, 85), "clearance": (70, 100), "goal_kick": (70, 95), "throw_in": (30, 45),
}
LOFTED = {"long_pass", "cross", "switch", "clearance", "goal_kick"}
PEAK_M = {"long_pass": (4, 10), "cross": (3, 7), "switch": (5, 10), "clearance": (8, 14), "goal_kick": (10, 16)}
LONG_PASS_M = 32.0
SWITCH_DY_M = 35.0

# --- Shots and xG (actions.md §4) --------------------------------------------------------------------------------
#
# xG = 1 / (1 + e^-z), z = b0 + b_logd·ln(distance) + b_angle·angle + b_d·distance + adjustments.
# Fitted (least squares on the log-odds) to the public anchors in CALIBRATION.md plus three off-centre reference
# shots. Measured: six-yard central 0.45 (target about 0.40), edge of box 0.09 (0.06-0.08), 25 m 0.033 (0.02-0.03).
# The penalty-spot open-play anchor of about 0.30 is unsourced; this model gives about 0.18 there.

XG_B0 = -4.826
XG_B_LOGD = 1.544
XG_B_ANGLE = 2.231
XG_B_D = -0.167
XG_HEADER = -0.95                   # six-yard header about 0.24, under the 0.25 anchor (foot about 0.45)
XG_WEAK_FOOT = -0.12                 # × (5 - weak_foot)
XG_SITUATION = {"open_play": 0.0, "counter": 0.25, "corner": -0.15, "free_kick": -0.15, "throw_in": -0.10}
XG_ASSIST = {"none": 0.0, "through_ball": 0.35, "cutback": 0.40, "cross": -0.25, "set_piece": -0.10}
XG_PER_DEFENDER = -0.35              # each opponent inside the ball-to-posts triangle
XG_KEEPER_OFF_LINE = 0.12            # per metre the keeper is off the ball-goal line beyond 1.5 m (max 4 m)
PENALTY_XG = 0.78                    # Opta
BIG_SHOT_XG_MAX = 0.95
HEADER_SHOT_SHARE = 0.55            # a won header in the box is a shot this often; otherwise it's controlled

ON_TARGET_BASE = 0.43                # P(on target) = base + slope × xG, then skill, pressure, foot, fatigue;
ON_TARGET_XG_SLOPE = 0.9             # about 45-50 % of unblocked shots are on target (CALIBRATION.md)
ON_TARGET_RANGE = (0.12, 0.92)
ON_TARGET_PER_FINISHING = 0.001     # per finishing point above FINISH_REF
BLOCK_PER_DEFENDER = 0.18
WOODWORK_SHARE = 0.06                # of off-target shots
FINISH_LOGIT_PER_10 = 0.06           # finishing vs goalkeeping, per 10 points (elite finisher beats xG by 10-20 %)
FINISH_REF = 73                      # the average shooter's finishing...
KEEPER_REF = 79                      # ...and the league's typical starting keeper: together they score at xG
GOAL_GIVEN_ON_TARGET_MAX = 0.97
SHOT_SPEED_KMH = {"foot": (70, 120), "head": (40, 75)}
BLOCK_CORNER = 0.35                 # a blocked shot goes behind for a corner this often
CROSS_HEADED_CORNER = 0.25          # a defender heading a cross away puts it behind this often
CROSS_CUT_OUT_CORNER = 0.15         # an inaccurate cross is cut out behind for a corner this often
SAVE_RESULT = {"held": 0.45, "parried": 0.35, "corner": 0.20}

# --- Movement (movement.md §2) -----------------------------------------------------------------------------------

JOG_SHARE = 0.55                     # share of top speed when only repositioning
DECEL_MAX = 5.0                      # m/s²
ARRIVE_S = 0.6                       # slow down within this many seconds of the target
WOBBLE_M = 0.08
CARRY_S = (1.5, 4.0)
# Support runs with the ball in the final third (movement.md §1): each slot stays at least this far ahead of the ball
# (team-frame percent; negative is behind it). Slots running ahead attack the far post when the ball is wide on the
# other side.
SUPPORT_OFFSET_PCT = {"ST": 6.0, "RW": 6.0, "LW": 6.0, "AM": 4.0, "RM": 3.0, "LM": 3.0, "CM": -10.0}
SUPPORT_BOX_X = 88.0                 # far-post run depth...
SUPPORT_FAR_POST_Y = 10.0            # ...and this far off the centre line
# Out of possession the lines sit (anchor gap) × (base + line × line_height) apart: a low block is compact.
BLOCK_DEPTH_BASE = 0.55
BLOCK_DEPTH_LINE = 0.35
GOAL_SIDE_PCT = 8.0                  # defenders stay at least this far goal-side of the ball
DEEP_DEFENCE_X = 25.0                # with the ball this close to their goal (team-frame percent)...
DEEP_DEFENCE_NARROW = 0.6            # ...defenders close in toward the posts by this factor
MARK_ZONE_X = 35.0                   # with the ball in their own third, defenders and midfielders pick up the
MARK_RADIUS_PCT = 15.0               # ...nearest attacker this close to their spot...
MARK_TIGHT = 0.85                    # ...moving this share of the way to him...
MARK_GOAL_SIDE_PCT = 2.0             # ...to a spot this far goal-side of him
BALL_HELD_AHEAD_M = 0.6
SPRINT_KMH = 25.0

# --- Fatigue (engine.md §6) --------------------------------------------------------------------------------------

STAMINA_DRAIN_BASE = 1.0e-5          # per step, standing
STAMINA_DRAIN_RUN = 4.0e-5           # per step, × (speed / 7 m/s)³
HALF_TIME_RECOVERY = 0.15
TIRED = 0.7                          # below this, pace and accuracy start to drop
TIRED_MAX_LOSS = 0.08

# --- Discipline and set pieces (set-pieces-and-discipline.md) ----------------------------------------------------

FOUL_FROM_BEHIND = 1.8
FOUL_TACTICAL = 1.6                  # stopping a counter attack
HOME_FOUL_LENIENCY = 0.10            # home fouls given this much less often at a full house
ADVANTAGE_SHARE = 0.35               # fouls in the attacking 40 % where the referee plays on
FOUL_IN_OWN_BOX = 0.03               # defenders are careful in their own box (a foul there is a penalty)
CARD_ORDINARY_YELLOW = 0.085
CARD_ORDINARY_RED = 0.002
CARD_TACTICAL_YELLOW = 0.38
CARD_BEHIND_YELLOW = 0.30
CARD_BEHIND_RED = 0.02
CARD_DOGSO_RED = 0.6                 # denying an obvious goal-scoring opportunity
MAX_SUBS = 5
OFFSIDE_BASE = 0.03                  # a runner played in behind mistimes his run this often...
OFFSIDE_LINE_HEIGHT = 0.15           # ...plus this × the defending side's line_height
FREE_KICK_DIRECT_M = 30.0            # a central free kick this close may be shot at goal
FREE_KICK_DIRECT_SHARE = 0.6         # × (0.5 + set_piece_focus)
SHORT_CORNER = 0.35                  # corners played short: this × (1 - set_piece_focus)
LONG_THROW_SHARE = 0.5               # final-third throw-ins thrown long: set_piece_focus × this
LONG_THROW_DEPTH_M = 9.0             # aimed this far out from the goal line
SET_PIECE_FOCUS_LOGIT = 2.5          # set-piece deliveries: + this × (set_piece_focus - 0.5) on the log-odds
FREE_KICK_WALL = 2                   # wall players counted as defenders in the way
