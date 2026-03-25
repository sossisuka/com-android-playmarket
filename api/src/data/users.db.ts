export const usersDb = {
  "users": [
    {
      "id": "f3a8fd84fc0dc1f06bbdf75a",
      "email": "edward.tsky@gmail.com",
      "firstName": "эдуард",
      "lastName": "прилуцкий",
      "country": "RU",
      "createdAt": "2026-03-20T21:43:47.301Z",
      "passwordHash": "scrypt$b04d683dab4c628b84d8566509e62ee1$c71d7647c80fd9d2fa5716b34f718fa64ef907387969f3dbebd47b820a2f2db7eaf1097cb79808cfb9fd38520e01646f29358bf41dcf784b66c8e2acf9c11868",
      "favoriteAppIds": [
        "com.mojang.minecraftpe"
      ],
      "libraryAppIds": [
        "com.fansipan.stickman.shadow.knights.fightinggames"
      ]
    },
    {
      "id": "318d67d533d2f9f00a58a4ad",
      "email": "selenchikksenia@gmail.com",
      "firstName": "Ксения",
      "lastName": "Селенчик",
      "country": "RU",
      "createdAt": "2026-03-24T17:41:32.815Z",
      "passwordHash": "scrypt$37fa3505c8243e5cff01e38a5cd3899c$c9df29753f609a6642a7cf2f03087e541a1646d369f625338ca29fd3bb4aef788fd577ac8e0ac56154d79d9a6f8530c4f37171f6b195eb2f294da12549f3bc19",
      "favoriteAppIds": [],
      "libraryAppIds": []
    }
  ],
  "sessions": [
    {
      "token": "ca8145e1b9b98c42dc07445ea58423f50e5ea835a4d271020c28105fc488f29b",
      "userId": "318d67d533d2f9f00a58a4ad",
      "createdAt": "2026-03-24T17:41:32.864Z"
    },
    {
      "token": "531381e6639246b90ceef900c348fb0ad82f492e5cf51e19f54c38c668212818",
      "userId": "f3a8fd84fc0dc1f06bbdf75a",
      "createdAt": "2026-03-24T19:42:28.471Z"
    },
    {
      "token": "87a93343b7ff0572660563a2a96c82104927db640ef6f4bc1e784e8a0e619f88",
      "userId": "f3a8fd84fc0dc1f06bbdf75a",
      "createdAt": "2026-03-24T21:08:58.272Z"
    },
    {
      "token": "c493e6c40c92d3fa093f831f7f43747db9875caade23b6bdfe9802d5a8da3b3f",
      "userId": "f3a8fd84fc0dc1f06bbdf75a",
      "createdAt": "2026-03-25T04:02:01.988Z"
    }
  ]
} as const;
