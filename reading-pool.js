// reading-pool.js — 「阅读」tab 的兜底文章池（AI 生成失败时使用，按 page 轮转）
// 由与 prompts.js buildReadingPrompt 同族的指令生成：每批 5 篇、纯英语正文、A2 入门、340–460 字符、3 段。
export const READING_POOL = [
  [
    {
      "title": "My Simple Healthy Habits",
      "topic": "健康习惯",
      "body": "I try to stay healthy. Every morning, I drink a glass of water. Then I eat a good breakfast. I often have eggs and fruit.\n I walk to school or work.\n\nIt is not far. Walking is good exercise. After lunch, I take a short walk. I also play sports on weekends.\n At night, I go to bed early.\n\nI sleep for eight hours. I do not use my phone before bed. These small habits help me feel good.",
      "background": "健康习惯是英语初学者常见话题，因为相关词汇简单且日常。英语中常用 'stay healthy'、'good exercise' 等表达。",
      "reason": "句子简短，词汇基础，适合A2水平练习日常生活描述。",
      "words": [
        "stay healthy",
        "breakfast",
        "exercise"
      ]
    },
    {
      "title": "Shopping and Ordering Food",
      "topic": "购物点餐",
      "body": "I like to go shopping. I often buy clothes and food. In a shop, I ask: \"How much is this?\" The shop assistant tells me the price. I pay with cash or card.\n\nSometimes I eat out. I go to a restaurant. I look at the menu. I order a sandwich and a drink. I say: \"I would like a coffee, please.\"\n\nThe waiter brings my food.\n After eating, I ask for the bill. I leave a tip. Then I say \"Thank you\" and go home. Shopping and eating out are fun.",
      "background": "购物和点餐是英语日常交流的核心场景，常用句型如 'How much is this?' 和 'I would like...'。",
      "reason": "包含实用对话短语，句子结构简单，适合初学者模仿。",
      "words": [
        "How much",
        "order",
        "bill"
      ]
    },
    {
      "title": "My Neighborhood",
      "topic": "邻里社区",
      "body": "I live in a nice neighborhood. There are many houses and a small park. My neighbors are friendly. We say \"Hello\" when we meet.\n Sometimes we have a party in the park.\n\nEveryone brings food. Children play games. Adults talk and laugh. It is a good time.\n I like my neighborhood because it is quiet and safe.\n\nThere is a shop and a school nearby. I can walk to the bus stop. I feel happy here.",
      "background": "邻里社区话题帮助初学者描述居住环境，英语中常用 'neighborhood'、'neighbors'、'nearby' 等词。",
      "reason": "内容贴近生活，使用 there be 句型和简单描述，易于理解。",
      "words": [
        "neighborhood",
        "friendly",
        "nearby"
      ]
    },
    {
      "title": "Traveling and Going Places",
      "topic": "旅行出行",
      "body": "I love to travel. Last summer, I went to the beach. I took a bus. The trip was two hours. I saw many trees and hills on the way.\n\nAt the beach, I swam and played. I ate ice cream. I took many photos. I met a new friend. We talked and laughed.\n\nTraveling is exciting. I want to visit a big city next year. I will go by train. I will see museums and try new food. I can't wait.",
      "background": "旅行出行是英语中常见话题，涉及交通、住宿和活动。常用一般过去时和一般将来时。",
      "reason": "时态简单，词汇常见，适合初学者练习叙述经历和计划。",
      "words": [
        "travel",
        "trip",
        "visit"
      ]
    },
    {
      "title": "How I Study English",
      "topic": "学习技巧",
      "body": "I am learning English. I use some good ways. First, I listen to English songs. I try to understand the words. Second, I watch English movies with subtitles.\n\nI also read simple books. I write new words in a notebook. I review them every day. I practice speaking with a friend. We talk for ten minutes.\n\nMistakes are okay. I learn from them. I study a little every day. This helps me improve. English is fun!",
      "background": "学习技巧话题让初学者用英语谈论自己的学习方法，常用 'listen to'、'practice'、'improve' 等动词。",
      "reason": "提供实用学习建议，句子短小，鼓励初学者坚持学习。",
      "words": [
        "practice",
        "improve",
        "mistake"
      ]
    }
  ],
  [
    {
      "title": "Four Seasons in a Year",
      "topic": "天气季节",
      "body": "There are four seasons in a year. They are spring, summer, autumn and winter. Each season has different weather. In spring, it is warm and sunny. Flowers open and birds sing.\n\nIn summer, it is hot. People like to swim and eat ice cream. In autumn, it is cool. Leaves turn yellow and fall from trees. In winter, it is cold.\n\nIt often snows. People wear coats and scarves. They drink hot tea at home. Which season do you like best?",
      "background": "英语中谈论天气和季节是非常常见的日常话题，因为英国人常以天气开启对话。",
      "reason": "文章用简单句介绍四季，词汇基础，适合初学者掌握天气相关表达。",
      "words": [
        "season",
        "weather",
        "snow"
      ]
    },
    {
      "title": "My Free Time Hobbies",
      "topic": "兴趣爱好",
      "body": "In my free time, I like to read books. I read stories about animals and people. Reading is fun and I learn new words. My brother likes to play football. He plays with his friends in the park.\n\nMy sister likes to draw pictures. She uses many colors. She draws cats and flowers. My mother likes to cook. She makes cakes and noodles.\n\nMy father likes to listen to music. He listens to old songs. We all have different hobbies. What do you like to do?",
      "background": "在英语国家，询问和分享兴趣爱好是结交朋友、开始对话的常见方式。",
      "reason": "内容围绕日常爱好，句型重复简单，帮助初学者练习like to do结构。",
      "words": [
        "hobby",
        "free time",
        "listen to music"
      ]
    },
    {
      "title": "Talking at Work",
      "topic": "职场沟通",
      "body": "At work, we talk to many people. We talk to our boss and our team. Good talking helps us work well. When we ask for help, we say, \"Can you help me, please?\"\n\nWhen we finish a job, we say, \"I am done.\" When we have a question, we say, \"Excuse me, I have a question.\" When we agree, we say, \"That sounds good.\" When we do not agree, we say, \"I am not sure.\"\n\nWe also say \"thank you\" and \"please.\" These words are polite and important. They make work easy and happy.",
      "background": "英语职场中，礼貌用语和清晰表达非常重要，常用简单句来沟通任务和请求。",
      "reason": "短文列出职场常用短句，实用性强，适合初学者快速上手。",
      "words": [
        "boss",
        "team",
        "polite"
      ]
    },
    {
      "title": "Saying Hello and Goodbye",
      "topic": "社交寒暄",
      "body": "When we meet someone, we say hello. We can say, \"Hi, how are you?\" The other person says, \"I am fine, thank you. And you?\" We can also say, \"Good morning\" or \"Good afternoon.\"\n\nWhen we leave, we say goodbye. We can say, \"See you later\" or \"Have a nice day.\" We shake hands or smile. We ask simple questions like, \"How is your family?\" or \"What is new?\"\n\nThese small talks are friendly. They help people feel happy and close. It is good to be kind and say nice words.",
      "background": "英语社交寒暄（small talk）是日常礼貌，常用固定问候语和简单问题来拉近距离。",
      "reason": "对话式短句简单易记，适合初学者练习见面和告别用语。",
      "words": [
        "hello",
        "goodbye",
        "small talk"
      ]
    },
    {
      "title": "Saving Money Every Day",
      "topic": "理财省钱",
      "body": "Saving money is good for everyone. We can save a little money every day. First, make a plan. Write down what you need and what you want. Buy only what you need.\n\nSecond, cook at home. It is cheaper than eating out. Third, use the bus or walk. It saves money and is good for you. Fourth, turn off lights and water.\n\nIt helps the earth and your money. Fifth, put some money in a bank. It is safe there. Saving money takes time, but it is smart. Start today!",
      "background": "在英语国家，从小教孩子存钱和理财是常见话题，常用简单建议和祈使句。",
      "reason": "文章用简单步骤和常见动词，适合初学者学习理财相关词汇和表达。",
      "words": [
        "save money",
        "cheaper",
        "bank"
      ]
    }
  ]
];
