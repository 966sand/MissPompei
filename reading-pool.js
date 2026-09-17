// reading-pool.js — 「阅读」兜底文章池（AI 生成失败/超时时使用，按 page 轮转）
// 双端共用同一份内容：本文件与 小程序 cloudfunctions/analyze/reading-pool.js
// 仅导出格式不同（ESM / CJS），内容必须逐字一致。改动请同时改两边。
// 6 批共 28 篇，纯英语正文、A2 入门、3 段、330–470 字符。
// 注意：网页端每一篇都会生成一个 /read/<slug> 静态页（见 content-pages.js），
// 所以这里的篇数直接等于可被搜索引擎收录的落地页数。
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
  ],
  [
    {
      "title": "My Daily Routine",
      "topic": "日常作息",
      "body": "I wake up at seven every morning.  First, I brush my teeth and wash my face.  Then I eat breakfast with my family.\n\nAfter breakfast, I go to school by bus.  I have classes from nine to twelve.  At noon, I eat lunch and talk with my friends.\n\nIn the evening, I do my homework and watch TV.  I go to bed at ten.  I feel happy every day.",
      "background": "这篇短文介绍了一个学生从早到晚的日常活动，用简单的句子描述作息安排。",
      "reason": "内容贴近生活，词汇基础，适合初学者学习如何用英语表达日常习惯。",
      "words": [
        "wake up",
        "brush teeth",
        "go to bed"
      ]
    },
    {
      "title": "A Trip to the Beach",
      "topic": "旅行出行",
      "body": "Last summer, I went to the beach with my friends.  We took a bus and arrived in two hours.  The sun was bright and the sea was blue. \n We swam in the water and played games on the sand.\n\nI ate ice cream and drank cold juice.  We took many photos. \n In the evening, we watched the sunset.  It was beautiful.\n\nWe felt tired but very happy.  I want to go there again.",
      "background": "这篇短文讲述了一次去海滩的旅行经历，包括交通、活动和感受。",
      "reason": "主题轻松有趣，常用动词和形容词丰富，适合初学者练习叙述过去的事情。",
      "words": [
        "beach",
        "swim",
        "sunset"
      ]
    },
    {
      "title": "Buying Food and Drinks",
      "topic": "购物点餐",
      "body": "I go to a fast food restaurant.  I say, \"I want a hamburger and a Coke, please.\"  The waiter says, \"OK, that is five dollars.\"  I give him the money.\n\nThen I sit at a table and eat my food.  The hamburger is hot and tasty.  The Coke is cold and sweet.  I like this meal.\n\nAfter eating, I say, \"Thank you.  Goodbye.\"  I feel full and happy.  I will come back again.",
      "background": "这篇短文模拟了在快餐店点餐和付款的过程，包含简单的对话和食物描述。",
      "reason": "场景真实，句型直接，能帮助初学者学会点餐和购物时的基本表达。",
      "words": [
        "hamburger",
        "waiter",
        "tasty"
      ]
    },
    {
      "title": "Saying Hello to Friends",
      "topic": "社交寒暄",
      "body": "When I meet my friend, I say, \"Hi!  How are you?\"  She says, \"I am fine, thank you.  And you?\"  I say, \"I am good, thanks.\"\n\nWe smile at each other. \n Then we talk about the weather.  I say, \"It is a nice day today.\"  She says, \"Yes, it is warm and sunny.\"  We laugh and chat for a while.\n\nBefore leaving, I say, \"See you later.  Have a good day!\"  She says, \"You too.  Bye!\"  Good greetings make people happy.",
      "background": "这篇短文展示了朋友见面时的问候、闲聊和告别，用简单对话体现社交礼仪。",
      "reason": "对话自然，词汇简单，适合初学者练习日常社交中的寒暄用语。",
      "words": [
        "greeting",
        "weather",
        "chat"
      ]
    },
    {
      "title": "My Healthy Habits",
      "topic": "健康习惯",
      "body": "I try to stay healthy every day.  I eat fruit and vegetables for lunch.  I also drink a lot of water.\n\nAfter school, I play soccer with my friends.  We run and jump for one hour.  It is fun and good for my body.\n\nAt night, I go to bed early.  I sleep for eight hours.  Sleep helps me feel good and think well.",
      "background": "健康习惯是英语初学者常聊的话题，也是日常交流中的基础内容。",
      "reason": "用简单句描述日常健康习惯，容易模仿和记忆。",
      "words": [
        "healthy",
        "vegetables",
        "early"
      ]
    }
  ],
  [
    {
      "title": "Weather and Seasons",
      "topic": "天气季节",
      "body": "There are four seasons in a year.  Spring is warm and flowers grow.  Summer is hot and sunny.\n\nIn autumn, the leaves turn red and brown.  The weather is cool and windy.  I like to walk in the park.\n\nWinter is cold and it snows.  I wear a coat and gloves.  I play in the snow with my sister.",
      "background": "天气和季节是英语初学者必须掌握的基础词汇和表达。",
      "reason": "通过四季描述，轻松学习天气相关词汇和简单句型。",
      "words": [
        "seasons",
        "leaves",
        "snows"
      ]
    },
    {
      "title": "My Hobbies",
      "topic": "兴趣爱好",
      "body": "I have two hobbies.  I like reading books and drawing pictures.  I read stories about animals.\n\nI draw with my colored pencils.  I draw my cat and my house.  Drawing makes me happy and calm.\n\nOn weekends, I also ride my bike.  I go to the park with my dad.  We have a good time together.",
      "background": "兴趣爱好是日常对话中常见的话题，能帮助初学者表达自己喜欢的事。",
      "reason": "用简单句介绍爱好，词汇实用，容易开口练习。",
      "words": [
        "hobbies",
        "drawing",
        "weekends"
      ]
    },
    {
      "title": "In My Neighborhood",
      "topic": "邻里社区",
      "body": "I live in a small neighborhood.  There is a park and a shop near my house.  Many families live here. \n My neighbors are friendly.\n\nMrs.  Lee has a dog.  We say hello every morning.  Sometimes we talk in the park.\n\nOn Saturdays, we have a small market.  People sell food and clothes.  I like to help my mom there.",
      "background": "邻里社区是初学者描述居住环境和人际交往的常见主题。",
      "reason": "内容贴近生活，容易理解，能学到描述社区的常用表达。",
      "words": [
        "neighborhood",
        "friendly",
        "market"
      ]
    },
    {
      "title": "Going to Work by Bus",
      "topic": "通勤交通",
      "body": "Every morning, I take the bus to work.  The bus stop is near my house.  I wait for the number 10 bus. \n The bus comes at 7:30.\n\nIt is often full of people.  I stand or find a seat.  The ride takes 20 minutes. \n I get off at the city center.\n\nThen I walk to my office.  Taking the bus is cheap and easy.",
      "background": "本文介绍了一个人早上乘坐公交车上班的通勤过程，适合初学者学习交通相关词汇。",
      "reason": "内容贴近日常生活，句子简单，容易模仿。",
      "words": [
        "take the bus",
        "bus stop",
        "get off"
      ]
    },
    {
      "title": "Ordering a Coffee",
      "topic": "点咖啡",
      "body": "I go to a coffee shop every Saturday.  I like to order a small coffee.  The barista asks, \"What can I get for you?\" \n I say, \"A small latte, please.\"\n\nShe asks, \"For here or to go?\"  I answer, \"To go, please.\"  Then I pay three dollars. \n I wait for two minutes.\n\nMy coffee is ready.  I say, \"Thank you!\"  and leave.  It is a nice start to my day.",
      "background": "本文模拟了在咖啡店点咖啡的简单对话，帮助初学者掌握点单常用表达。",
      "reason": "实用场景对话，词汇简单，易于在实际中运用。",
      "words": [
        "order",
        "for here or to go",
        "barista"
      ]
    }
  ],
  [
    {
      "title": "Seeing a Doctor",
      "topic": "看病买药",
      "body": "I feel sick today.  I have a headache and a fever.  I go to see a doctor.  The doctor asks, \"What's wrong?\"\n\nI say, \"I have a headache and a fever.\"  He checks me and says, \"You have a cold.  Take this medicine.\"  He gives me a prescription.\n\nI go to the pharmacy to buy the medicine.  The pharmacist says, \"Take it twice a day.\"  I go home and rest.  I feel better soon.",
      "background": "本文描述了生病看医生和买药的过程，适合初学者学习医疗相关的基本表达。",
      "reason": "常见生活场景，句型简单，有助于应对实际需要。",
      "words": [
        "headache",
        "prescription",
        "pharmacy"
      ]
    },
    {
      "title": "Using My Phone",
      "topic": "手机与网络",
      "body": "I use my phone every day.  I send messages to my friends.  I also check the news and weather.  My phone needs the internet.\n\nAt home, I connect to Wi-Fi.  The Wi-Fi is fast.  I watch videos and listen to music.  I don't use too much data.\n\nWhen I go out, I use mobile data.  Sometimes the signal is weak.  But I can still call and text.  My phone is very useful.",
      "background": "本文介绍了手机和网络的日常使用，包括Wi-Fi和移动数据，适合初学者学习科技词汇。",
      "reason": "主题现代实用，句子简短，容易理解。",
      "words": [
        "Wi-Fi",
        "mobile data",
        "signal"
      ]
    },
    {
      "title": "Doing Housework",
      "topic": "家务整理",
      "body": "On weekends, I do housework.  I clean the floor and dust the shelves.  I also do the laundry.  It takes about two hours.\n\nFirst, I tidy up the living room.  I put books and clothes away.  Then I vacuum the carpet.  After that, I wash the dishes.\n\nI like to listen to music while I work.  When I finish, the house looks nice.  I feel happy and relaxed.",
      "background": "本文讲述了周末做家务的过程，包括打扫、洗衣和整理，适合初学者学习家务相关词汇。",
      "reason": "内容简单有序，动词短语实用，便于记忆。",
      "words": [
        "do housework",
        "tidy up",
        "laundry"
      ]
    },
    {
      "title": "My Summer Holiday Plan",
      "topic": "假期计划",
      "body": "Next month, I will have a long holiday.  I am very happy about it.  I want to do many fun things.\n\nFirst, I will visit my grandparents in the countryside.  We will eat fresh food and take walks.  I will also read two books and learn to swim.\n\nFinally, I will go to the beach with my friends.  We will play games and take photos.  I think it will be a great holiday.",
      "background": "这是一篇关于假期安排的短文，适合初学者学习如何用英语表达未来的计划。",
      "reason": "文章使用简单将来时和常见活动词汇，帮助初学者掌握计划类表达。",
      "words": [
        "holiday",
        "visit",
        "beach"
      ]
    },
    {
      "title": "A Job Interview",
      "topic": "求职面试",
      "body": "Yesterday, I had a job interview at a small shop.  I was a little nervous.  I wore a clean shirt and arrived early.\n\nThe manager asked me some questions.  I told him about my school and my hobbies.  He smiled and said I was friendly.\n\nToday, he called me and gave me the job.  I am very happy.  I will start work next Monday.",
      "background": "这篇短文描述了一次简单的求职面试经历，适合初学者了解面试相关的基本表达。",
      "reason": "内容贴近日常求职场景，句子简短，便于初学者模仿和记忆。",
      "words": [
        "interview",
        "nervous",
        "manager"
      ]
    }
  ],
  [
    {
      "title": "Borrowing and Returning Money",
      "topic": "借钱还钱",
      "body": "Last week, I borrowed ten dollars from my friend Tom.  I wanted to buy a new book.  I said I would pay him back soon.\n\nYesterday, I got some money from my parents.  I went to Tom's house and gave him the money.  He said, \"Thank you for returning it so fast.\"\n\nI felt good because I kept my promise.  Now we are still good friends.  It is important to be honest about money.",
      "background": "这篇短文讲述了借钱和还钱的简单故事，帮助初学者学习相关词汇和表达。",
      "reason": "通过日常小事传递诚实守信的道理，语言简单，易于理解。",
      "words": [
        "borrow",
        "return",
        "promise"
      ]
    },
    {
      "title": "My Lovely Pet Dog",
      "topic": "宠物",
      "body": "I have a pet dog.  His name is Lucky.  He is small and white.  He has big black eyes.\n\nLucky likes to play with a ball.  Every morning, I take him for a walk in the park.  He runs and jumps happily.  He also likes to eat meat and rice.\n\nAt night, Lucky sleeps next to my bed.  He is my best friend.  I love him very much.",
      "background": "这是一篇关于宠物的短文，描述了一只小狗的外貌、习性和与主人的关系。",
      "reason": "内容温馨，用词基础，适合初学者练习描述动物和日常活动。",
      "words": [
        "pet",
        "walk",
        "friend"
      ]
    },
    {
      "title": "Celebrating the Spring Festival",
      "topic": "节日庆祝",
      "body": "The Spring Festival is my favorite holiday.  It comes in January or February.  My family gets together to celebrate. \n We clean our house and buy new clothes.\n\nWe also make dumplings and watch TV.  At night, we set off fireworks.  The sky looks very beautiful. \n Children get red envelopes with money.\n\nWe say \"Happy New Year\" to each other.  Everyone feels happy and excited.",
      "background": "这篇短文介绍了中国春节的庆祝方式，适合初学者学习节日相关表达。",
      "reason": "内容贴近中国文化，词汇常见，有助于初学者用英语介绍传统节日。",
      "words": [
        "celebrate",
        "dumpling",
        "firework"
      ]
    }
  ]
];
