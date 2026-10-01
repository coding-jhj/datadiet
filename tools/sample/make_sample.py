"""Build the demo sample that ships with DataDiet.

REAL mode (run this on your own PC; needs `pip install datasets` and internet):
    python tools/sample/make_sample.py --mode real --out public/sample/smoltalk-sample.jsonl

It streams the four Apache-2.0 SmolTalk subsets used in the study (pinned
revision), takes a seeded sample from each, and appends ~15 clearly synthetic
"demo-issues" rows so the data health check has something to show.

OFFLINE mode (used to build a placeholder when Hugging Face is unreachable):
    python tools/sample/make_sample.py --mode offline --out public/sample/smoltalk-sample.jsonl

Offline mode writes template-generated English text. It is only a stand-in for
development and tests; it is NOT SmolTalk data and is labelled accordingly.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

DATASET = "HuggingFaceTB/smoltalk"
REVISION = "5feaf2fd3ffca7c237fc38d1861bc30365d48ffa"
CONFIGS = ["smol-magpie-ultra", "smol-constraints", "smol-rewrite", "smol-summarize"]
PER_CONFIG = {"smol-magpie-ultra": 120, "smol-constraints": 200, "smol-rewrite": 160, "smol-summarize": 160}
SCAN_ROWS = 4000
MAX_CHARS = 8000

TOPICS: dict[str, list[str]] = {
    "photosynthesis": [
        "Photosynthesis is the process by which plants turn light into chemical energy.",
        "It takes place mainly in the chloroplasts, which contain the green pigment chlorophyll.",
        "Plants absorb carbon dioxide from the air through tiny openings called stomata.",
        "Water travels up from the roots and supplies the hydrogen needed to build sugars.",
        "Oxygen is released as a by-product and enters the atmosphere.",
        "The light-dependent reactions capture energy and store it in molecules such as ATP.",
        "The Calvin cycle then uses that energy to assemble glucose from carbon dioxide.",
        "Leaf color, thickness, and angle all affect how much light a plant can use.",
        "Photosynthesis in oceans, mostly by algae, produces a large share of the oxygen we breathe.",
        "Farmers pay attention to sunlight and water because they limit how fast crops can grow.",
    ],
    "the water cycle": [
        "The water cycle describes how water moves between the ocean, the air, and the land.",
        "Heat from the sun causes water to evaporate from oceans, lakes, and rivers.",
        "Plants also release water vapor into the air through a process called transpiration.",
        "As warm air rises it cools, and the vapor condenses into tiny droplets that form clouds.",
        "When droplets grow heavy enough they fall as rain, snow, sleet, or hail.",
        "Some of the water runs over the surface and collects in streams and rivers.",
        "Another part soaks into the soil and refills underground reservoirs called aquifers.",
        "Glaciers and ice caps store water for long periods before it melts and rejoins the cycle.",
        "Human activities such as building cities and clearing forests change where the water goes.",
        "A changing climate is shifting rainfall patterns in many regions of the world.",
    ],
    "compound interest": [
        "Compound interest means that you earn interest on both your original money and on past interest.",
        "The longer money is left to grow, the faster the balance increases over time.",
        "A higher interest rate makes the effect stronger, but time usually matters even more.",
        "How often interest is added, such as monthly or yearly, changes the final amount slightly.",
        "Starting to save early gives a small monthly deposit far more room to grow.",
        "Debts can compound as well, which is why unpaid credit card balances grow so quickly.",
        "A simple rule of thumb divides seventy-two by the rate to estimate how long it takes to double.",
        "Inflation reduces what the money can buy, so real growth is lower than the stated rate.",
        "Regular contributions add to the base and speed up the compounding process.",
        "Understanding this idea helps people compare savings accounts, loans, and investments.",
    ],
    "the printing press": [
        "The printing press with movable type was developed in Europe in the fifteenth century.",
        "Johannes Gutenberg is the person most often credited with making it practical.",
        "Before its invention, books were copied by hand, which made them slow and expensive to produce.",
        "Metal letters could be arranged into a page, inked, and pressed onto paper many times.",
        "The cost of books fell, and more people learned to read as a result.",
        "New ideas about science, religion, and politics spread much faster than before.",
        "Printers established workshops in cities across the continent within a few decades.",
        "Standard spelling and grammar gradually emerged as printed works reached wider audiences.",
        "Newspapers, pamphlets, and maps became common tools for sharing information.",
        "Many historians regard the press as one of the most influential inventions in history.",
    ],
    "volcanoes": [
        "A volcano is an opening in the crust of a planet through which molten rock can escape.",
        "Most volcanoes form near the edges of tectonic plates where the crust is moving.",
        "Magma collects in a chamber below the surface until pressure forces it upward.",
        "Once magma reaches the surface it is called lava and can flow or explode.",
        "Some eruptions are gentle and steady, while others send ash many kilometers into the sky.",
        "Volcanic ash can disrupt air travel and cover farmland for months.",
        "Over thousands of years, volcanic soil becomes rich in minerals that help crops grow.",
        "Scientists monitor gas emissions, small earthquakes, and ground swelling to predict eruptions.",
        "Islands such as Hawaii and Iceland were built entirely by volcanic activity.",
        "Communities near active volcanoes prepare evacuation plans and warning systems.",
    ],
    "sleep and memory": [
        "Sleep plays an important role in how the brain stores and organizes memories.",
        "During deep sleep the brain replays recent experiences and strengthens useful connections.",
        "Rapid eye movement sleep is linked to emotional processing and creative problem solving.",
        "People who study and then sleep usually remember more than those who stay awake.",
        "Missing sleep makes it harder to focus, and new information is less likely to be stored.",
        "Most adults need between seven and nine hours of sleep each night.",
        "A regular schedule helps the body keep a steady internal clock.",
        "Bright screens late in the evening can delay the release of the hormone melatonin.",
        "Short naps can improve alertness without interfering with sleep at night.",
        "Researchers are still learning exactly how sleep stages cooperate to shape memory.",
    ],
    "electric cars": [
        "Electric cars use a battery and an electric motor instead of a gasoline engine.",
        "They produce no exhaust while driving, which improves air quality in crowded cities.",
        "Charging can happen at home overnight or at public stations along a route.",
        "Battery size determines the driving range, and larger batteries add cost and weight.",
        "Regenerative braking recovers some of the energy that would otherwise be lost as heat.",
        "Electric motors deliver strong acceleration because torque is available immediately.",
        "The environmental benefit depends on how the electricity is generated.",
        "Fewer moving parts mean there are fewer routine maintenance tasks such as oil changes.",
        "Recycling and reusing old batteries is an active area of research and business.",
        "Governments encourage adoption through incentives and by building charging networks.",
    ],
    "the Roman aqueducts": [
        "The Romans built aqueducts to carry fresh water from distant springs into their cities.",
        "Most of the channel ran gently downhill underground, using gravity to move the water.",
        "Where valleys interrupted the route, engineers built tall arched bridges of stone.",
        "Arches distributed weight efficiently, allowing structures to last for many centuries.",
        "Water fed public fountains, baths, and the homes of wealthy citizens.",
        "Settling tanks removed dirt so that the supply stayed reasonably clean.",
        "Maintenance crews cleaned channels and repaired leaks to keep the system working.",
        "Some sections, such as the Pont du Gard in France, still stand today.",
        "The construction required careful surveying to keep a constant, shallow slope.",
        "The aqueducts show how planning and engineering can shape daily life in a large city.",
    ],
    "bees and pollination": [
        "Bees visit flowers to collect nectar and pollen for food.",
        "While feeding, they carry pollen from one flower to another, which allows plants to produce seeds.",
        "A large share of fruits, vegetables, and nuts depends on animal pollination.",
        "Honeybees live in organized colonies with a queen, workers, and drones.",
        "Wild bees, including bumblebees and solitary species, are also important pollinators.",
        "Pesticides, disease, and the loss of habitat have reduced bee populations in some areas.",
        "Planting a variety of flowers gives bees food throughout the growing season.",
        "Beekeepers move hives to orchards and fields when crops begin to bloom.",
        "Bees communicate the location of good flowers with movements known as the waggle dance.",
        "Protecting pollinators supports both natural ecosystems and human food supplies.",
    ],
    "machine learning basics": [
        "Machine learning is a way of building software that improves by learning from examples.",
        "A model is trained on data and adjusts its internal numbers to reduce its mistakes.",
        "Training data should represent the situations the model will face in practice.",
        "A separate test set shows how well the model works on examples it has never seen.",
        "If a model memorizes the training data, it may perform poorly on new inputs.",
        "Supervised learning uses labeled examples, while unsupervised learning looks for structure.",
        "Simple models are easier to explain, but larger models can capture more complex patterns.",
        "Poor or biased data can lead to unfair or unreliable predictions.",
        "Engineers monitor deployed models because real-world data changes over time.",
        "Clear goals and careful evaluation matter as much as the choice of algorithm.",
    ],
    "coffee brewing": [
        "Coffee brewing extracts flavor from ground beans using hot water.",
        "Grind size affects how quickly the water pulls out flavor from the coffee.",
        "Water that is too hot can taste bitter, while water that is too cool tastes sour.",
        "A common starting point is about sixty grams of coffee for each liter of water.",
        "Fresh beans ground just before brewing usually produce a more aromatic cup.",
        "Pour-over, French press, and espresso each use different pressure and contact time.",
        "Clean equipment matters because old oils can add unpleasant flavors.",
        "Filtered water often gives a better result than water with a strong mineral taste.",
        "Small changes in timing or temperature can noticeably change the final flavor.",
        "Keeping notes on each attempt helps a home brewer find a favorite recipe.",
    ],
    "urban gardening": [
        "Urban gardening brings food and plants into small spaces such as balconies and rooftops.",
        "Containers, raised beds, and vertical frames make the most of limited room.",
        "Herbs, lettuce, and tomatoes are popular choices for beginners.",
        "Most vegetables need at least six hours of direct sunlight each day.",
        "Good potting soil and regular watering prevent plants from drying out in containers.",
        "Community gardens allow neighbors to share space, tools, and knowledge.",
        "Growing food locally can reduce transport and provide fresher produce.",
        "Compost from kitchen scraps returns nutrients to the soil.",
        "Plants can cool buildings and give shelter to insects and birds in a busy city.",
        "Starting small and learning from each season is a sensible way to begin.",
    ],
}
TOPIC_LIST = sorted(TOPICS)
BANNED = ["very", "really", "important", "many", "often", "most", "large", "small"]
CONNECTORS = ["First,", "Next,", "In addition,", "Another point is that", "Finally,", "It is also worth noting that"]


def take(rng: random.Random, topic: str, n: int, banned: str | None = None) -> list[str]:
    pool = [s for s in TOPICS[topic] if not banned or banned not in s.lower().split()]
    rng.shuffle(pool)
    return pool[:n]


def offline_rows(rng: random.Random) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {c: [] for c in CONFIGS}
    for _ in range(PER_CONFIG["smol-constraints"]):
        topic = rng.choice(TOPIC_LIST)
        n = rng.randint(2, 5)
        banned = rng.choice(BANNED)
        user = f"Write exactly {n} sentences about {topic}. Do not use the word \"{banned}\"."
        answer = " ".join(take(rng, topic, n, banned))
        out["smol-constraints"].append({"messages": [{"role": "user", "content": user}, {"role": "assistant", "content": answer}]})
    for _ in range(PER_CONFIG["smol-rewrite"]):
        topic = rng.choice(TOPIC_LIST)
        sentence = take(rng, topic, 1)[0]
        style = rng.choice(["formal", "simple", "friendly"])
        prefix = {"formal": "It is worth noting that ", "simple": "Put simply, ", "friendly": "Here is a fun fact: "}[style]
        rewritten = prefix + sentence[0].lower() + sentence[1:]
        user = f"Rewrite the following sentence so that it sounds more {style}: \"{sentence}\""
        out["smol-rewrite"].append({"messages": [{"role": "user", "content": user}, {"role": "assistant", "content": rewritten}]})
    for _ in range(PER_CONFIG["smol-summarize"]):
        topic = rng.choice(TOPIC_LIST)
        passage = " ".join(take(rng, topic, rng.randint(5, 9)))
        k = rng.choice([1, 2])
        sentences = passage.split(". ")
        summary = ("In short, " + sentences[0][0].lower() + sentences[0][1:].rstrip(".") + ".") if k == 1 else (sentences[0].rstrip(".") + ". " + sentences[-1].rstrip(".") + ".")
        user = f"Summarize the following text in {k} sentence{'s' if k == 2 else ''}.\n\n{passage}"
        out["smol-summarize"].append({"messages": [{"role": "user", "content": user}, {"role": "assistant", "content": summary}]})
    for _ in range(PER_CONFIG["smol-magpie-ultra"]):
        topics = rng.sample(TOPIC_LIST, 2)
        user1 = f"Explain {topics[0]} and how it relates to {topics[1]}. Please be thorough."
        paragraphs = []
        for i, t in enumerate(topics * 2):
            sents = take(rng, t, rng.randint(4, 7))
            paragraphs.append(f"{CONNECTORS[i % len(CONNECTORS)]} " + " ".join(sents))
        answer1 = "\n\n".join(paragraphs)
        user2 = "Thanks. Can you list three key takeaways?"
        bullets = [f"- {take(rng, rng.choice(topics), 1)[0]}" for _ in range(3)]
        answer2 = "Here are three key takeaways:\n" + "\n".join(bullets)
        out["smol-magpie-ultra"].append(
            {"messages": [
                {"role": "user", "content": user1}, {"role": "assistant", "content": answer1},
                {"role": "user", "content": user2}, {"role": "assistant", "content": answer2},
            ]}
        )
    return out


def real_rows(rng: random.Random) -> dict[str, list[dict]]:
    from datasets import load_dataset  # imported lazily: only needed on your PC

    out: dict[str, list[dict]] = {}
    for config in CONFIGS:
        stream = load_dataset(DATASET, config, split="train", streaming=True, revision=REVISION)
        pool = []
        for index, row in enumerate(stream):
            if index >= SCAN_ROWS:
                break
            messages = row.get("messages")
            if not isinstance(messages, list) or not messages:
                continue
            if sum(len(m.get("content", "")) for m in messages) > MAX_CHARS:
                continue
            pool.append({"messages": [{"role": m["role"], "content": m["content"]} for m in messages]})
        rng.shuffle(pool)
        out[config] = pool[: PER_CONFIG[config]]
        print(f"{config}: kept {len(out[config])} of {len(pool)} scanned rows")
    return out


def issue_rows(rng: random.Random, real: dict[str, list[dict]]) -> list[dict]:
    """Synthetic rows that make the health check visible. Clearly labelled 'demo-issues'."""
    def msg(u: str, a: str) -> dict:
        return {"messages": [{"role": "user", "content": u}, {"role": "assistant", "content": a}]}

    rows: list[dict] = []
    donors = [r for c in CONFIGS for r in real[c][:1]]
    rows += [json.loads(json.dumps(donors[0])), json.loads(json.dumps(donors[-1]))]  # 2 duplicates
    rows += [msg(f"Please explain topic number {i} in a few words.", "") for i in range(3)]  # 3 empty answers
    rows += [
        msg("Hello, can you introduce yourself to me?", "안녕하세요! 저는 도우미입니다. 무엇을 도와드릴까요?"),
        msg("What is the weather like today?", "今天天气很好，阳光明媚，适合出去散步。"),
        msg("Tell me something about your day.", "今日は天気がよくて、とても気持ちがいいですね。"),
        msg("How do you say hello in Russian today?", "Привет! Это простое русское приветствие."),
    ]  # 4 not-English
    rows += [
        msg("Please write a long sentence for testing purposes.", "This is a test " + "a" * 30 + " and it keeps going for the user."),
        msg("Please fill this line for the demo of repeated marks.", "Sure thing " + "!" * 25 + " here is what you asked for in the demo."),
    ]  # 2 repeated characters
    rows += [
        msg("What is two plus two? Please answer briefly for me.", "Four."),
        msg("Is the sky blue on a clear day, please tell me?", "Yes."),
        msg("Name one primary color for the design class, please.", "Red."),
    ]  # 3 very short answers
    long_words = " ".join(rng.choice(TOPICS[t])[:-1].lower() for t in TOPIC_LIST for _ in range(6))
    rows.append(msg("Write a very long essay about everything that you know, please.", (long_words + " ") * 6))  # 1 too long
    for row in rows:
        row["source"] = "demo-issues"
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["real", "offline"], required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260930)
    parser.add_argument("--scale", type=int, default=1, help="multiply rows per subset (use 20 for a study-size test file)")
    args = parser.parse_args()
    global SCAN_ROWS
    SCAN_ROWS *= args.scale
    for key in PER_CONFIG:
        PER_CONFIG[key] *= args.scale
    rng = random.Random(args.seed)

    data = real_rows(rng) if args.mode == "real" else offline_rows(rng)
    lines = []
    for config in CONFIGS:
        for row in data[config]:
            lines.append(json.dumps({"source": config, **row}, ensure_ascii=False))
    for row in issue_rows(rng, data):
        lines.append(json.dumps(row, ensure_ascii=False))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    label = "SmolTalk subsets (real)" if args.mode == "real" else "template-generated placeholder (NOT SmolTalk)"
    meta = {"mode": args.mode, "content": label, "rows": len(lines), "dataset": DATASET, "revision": REVISION if args.mode == "real" else None}
    args.out.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(lines)} rows ({args.out.stat().st_size / 1e6:.2f} MB) -> {args.out}  [{label}]")


if __name__ == "__main__":
    main()
