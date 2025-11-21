### Devlog

## 11/20
* Initial feature implementation
* Commands: profile, level calculation, daily rewards
* XP system:
    * Configurable base XP and multipliers per message
    * Role-based XP multipliers
    * Configurable cooldowns per role
* Level progression:
    * Custom level-up messages
    * Reply flags and commands per level
    * Multiple leveling formulas
* Style theme customization (planned)

## 11/21
* **Voice Channel Features**
    * Per-channel, per-role XP configuration
    * Session-based XP calculation (earned on leave)
    * In-memory session tracking via maps
* **Profile Improvements**
    * Progress bar visualization
    * Enhanced emoji support
* **Channel Controls**
    * Per-channel XP enable/disable
    * Channel-specific multipliers
    * Cooldown overrides (text and VC)
* **Leaderboard**
    * User ranking command
* **Performance**
    * Deferred replies for DB latency handling