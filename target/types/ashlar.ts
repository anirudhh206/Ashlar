/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/ashlar.json`.
 */
export type Ashlar = {
  "address": "7AESNgNKweEEveyb4vnuTpKALzjDhupFauAfgSc97z7t",
  "metadata": {
    "name": "ashlar",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "complianceCheck",
      "discriminator": [
        184,
        237,
        214,
        94,
        122,
        250,
        220,
        176
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "workflow"
          ]
        },
        {
          "name": "workflow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  102,
                  108,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "workflowId"
              }
            ]
          }
        },
        {
          "name": "attestation",
          "writable": true
        },
        {
          "name": "ledger",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  100,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "workflow"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "workflowId",
          "type": "u64"
        },
        {
          "name": "approved",
          "type": "bool"
        }
      ]
    },
    {
      "name": "fetchStep",
      "discriminator": [
        160,
        40,
        7,
        165,
        161,
        203,
        45,
        173
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "workflow"
          ]
        },
        {
          "name": "workflow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  102,
                  108,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "workflowId"
              }
            ]
          }
        },
        {
          "name": "attestation",
          "writable": true
        },
        {
          "name": "ledger",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  100,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "workflow"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "workflowId",
          "type": "u64"
        },
        {
          "name": "invoiceId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "guardrailCheck",
      "discriminator": [
        58,
        196,
        152,
        233,
        80,
        137,
        159,
        211
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "workflow"
          ]
        },
        {
          "name": "workflow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  102,
                  108,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "workflowId"
              }
            ]
          }
        },
        {
          "name": "attestation",
          "writable": true
        },
        {
          "name": "ledger",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  100,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "workflow"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "workflowId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "recipient",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "increment",
      "discriminator": [
        11,
        18,
        104,
        9,
        104,
        174,
        59,
        33
      ],
      "accounts": [
        {
          "name": "counter",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  117,
                  110,
                  116,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "counter",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  117,
                  110,
                  116,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeWorkflow",
      "discriminator": [
        9,
        226,
        202,
        241,
        194,
        97,
        181,
        111
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "workflow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  102,
                  108,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "workflowId"
              }
            ]
          }
        },
        {
          "name": "ledger",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  100,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "workflow"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "workflowId",
          "type": "u64"
        },
        {
          "name": "workflowType",
          "type": {
            "defined": {
              "name": "workflowType"
            }
          }
        },
        {
          "name": "spendCap",
          "type": "u64"
        },
        {
          "name": "allowlist",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    },
    {
      "name": "manualApproval",
      "discriminator": [
        187,
        24,
        240,
        60,
        40,
        205,
        100,
        222
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "workflow"
          ]
        },
        {
          "name": "workflow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  102,
                  108,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "workflowId"
              }
            ]
          }
        },
        {
          "name": "attestation",
          "writable": true
        },
        {
          "name": "ledger",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  100,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "workflow"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "workflowId",
          "type": "u64"
        },
        {
          "name": "approved",
          "type": "bool"
        }
      ]
    },
    {
      "name": "mockSettlement",
      "discriminator": [
        175,
        136,
        138,
        237,
        3,
        99,
        243,
        139
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "workflow"
          ]
        },
        {
          "name": "workflow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  102,
                  108,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "workflowId"
              }
            ]
          }
        },
        {
          "name": "attestation",
          "writable": true
        },
        {
          "name": "ledger",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  100,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "workflow"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "workflowId",
          "type": "u64"
        },
        {
          "name": "settlementReference",
          "type": "string"
        }
      ]
    },
    {
      "name": "resumeAfterOverride",
      "discriminator": [
        195,
        175,
        152,
        199,
        208,
        38,
        71,
        12
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "workflow"
          ]
        },
        {
          "name": "workflow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  102,
                  108,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "workflowId"
              }
            ]
          }
        },
        {
          "name": "attestation",
          "writable": true
        },
        {
          "name": "ledger",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  100,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "workflow"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "workflowId",
          "type": "u64"
        },
        {
          "name": "approved",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settleDirectTransfer",
      "docs": [
        "Real fund movement, on-chain: pays 1–4 recipients directly via an SPL `transfer_checked`",
        "CPI per leg, atomically with the settlement attestation. See",
        "instructions/settle_direct_transfer.rs's doc comment for the full design rationale."
      ],
      "discriminator": [
        81,
        162,
        184,
        9,
        162,
        193,
        154,
        61
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "workflow"
          ]
        },
        {
          "name": "workflow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  102,
                  108,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "workflowId"
              }
            ]
          }
        },
        {
          "name": "attestation",
          "writable": true
        },
        {
          "name": "ledger",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  100,
                  103,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "workflow"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "ownerTokenAccount",
          "docs": [
            "otherwise, since `owner` is the required signing authority for every leg."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "workflowId",
          "type": "u64"
        },
        {
          "name": "amounts",
          "type": {
            "vec": "u64"
          }
        },
        {
          "name": "decimals",
          "type": "u8"
        },
        {
          "name": "settlementReference",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "attestation",
      "discriminator": [
        152,
        125,
        183,
        86,
        36,
        146,
        121,
        73
      ]
    },
    {
      "name": "counter",
      "discriminator": [
        255,
        176,
        4,
        245,
        188,
        253,
        124,
        25
      ]
    },
    {
      "name": "ledger",
      "discriminator": [
        43,
        41,
        21,
        213,
        180,
        176,
        95,
        32
      ]
    },
    {
      "name": "workflowInstance",
      "discriminator": [
        243,
        11,
        247,
        11,
        92,
        193,
        11,
        198
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Only the counter authority can update this counter"
    },
    {
      "code": 6001,
      "name": "counterOverflow",
      "msg": "Counter has reached the maximum value"
    },
    {
      "code": 6002,
      "name": "outOfOrderStep",
      "msg": "This step was called out of order for the workflow's compiled step sequence"
    },
    {
      "code": 6003,
      "name": "workflowNotInProgress",
      "msg": "Workflow is not in progress (already completed or rejected)"
    },
    {
      "code": 6004,
      "name": "allowlistTooLarge",
      "msg": "Allowlist exceeds the maximum of 4 entries"
    },
    {
      "code": 6005,
      "name": "notPendingOverride",
      "msg": "Workflow is not paused awaiting an owner override"
    },
    {
      "code": 6006,
      "name": "invalidRecipientCount",
      "msg": "Recipient count must be between 1 and 4, and must match the amounts provided"
    },
    {
      "code": 6007,
      "name": "recipientNotAllowlisted",
      "msg": "A recipient's token account is not owned by a wallet on this workflow's allowlist"
    },
    {
      "code": 6008,
      "name": "invalidMint",
      "msg": "A recipient's token account is for the wrong mint"
    },
    {
      "code": 6009,
      "name": "amountOverflow",
      "msg": "Total settlement amount overflowed u64"
    }
  ],
  "types": [
    {
      "name": "attestation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "workflow",
            "type": "pubkey"
          },
          {
            "name": "stepIndex",
            "type": "u8"
          },
          {
            "name": "stepKind",
            "type": {
              "defined": {
                "name": "stepKind"
              }
            }
          },
          {
            "name": "executedBy",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "attestationOutcome"
              }
            }
          },
          {
            "name": "dataHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "attestationOutcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "passed"
          },
          {
            "name": "failed"
          },
          {
            "name": "executed"
          }
        ]
      }
    },
    {
      "name": "counter",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "count",
            "type": "u64"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "ledger",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "workflow",
            "type": "pubkey"
          },
          {
            "name": "entries",
            "type": {
              "vec": {
                "defined": {
                  "name": "ledgerEntry"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "ledgerEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stepIndex",
            "type": "u8"
          },
          {
            "name": "stepKind",
            "type": {
              "defined": {
                "name": "stepKind"
              }
            }
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "attestationOutcome"
              }
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "stepKind",
      "docs": [
        "The fixed gate sequence a compiled workflow enforces, in order. Mirrors",
        "`@ashlar/compiler`'s step vocabulary (`attestation`/`ledger_write` are implicit side",
        "effects of each of these on-chain, not separate steps here)."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "fetch"
          },
          {
            "name": "complianceCheck"
          },
          {
            "name": "manualApproval"
          },
          {
            "name": "guardrailCheck"
          },
          {
            "name": "mockSettlement"
          }
        ]
      }
    },
    {
      "name": "workflowInstance",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "workflowId",
            "type": "u64"
          },
          {
            "name": "workflowType",
            "type": {
              "defined": {
                "name": "workflowType"
              }
            }
          },
          {
            "name": "steps",
            "type": {
              "vec": {
                "defined": {
                  "name": "stepKind"
                }
              }
            }
          },
          {
            "name": "currentStep",
            "type": "u8"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "workflowStatus"
              }
            }
          },
          {
            "name": "spendCap",
            "type": "u64"
          },
          {
            "name": "allowlist",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "pendingAmount",
            "type": "u64"
          },
          {
            "name": "pendingRecipient",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "workflowStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "inProgress"
          },
          {
            "name": "completed"
          },
          {
            "name": "rejected"
          },
          {
            "name": "pendingOverrideApproval"
          }
        ]
      }
    },
    {
      "name": "workflowType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "recurringConditionalPayment"
          },
          {
            "name": "oneTimeApprovalGatedTransfer"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "attestationSeed",
      "type": "bytes",
      "value": "[97, 116, 116, 101, 115, 116, 97, 116, 105, 111, 110]"
    },
    {
      "name": "counterSeed",
      "type": "bytes",
      "value": "[99, 111, 117, 110, 116, 101, 114]"
    },
    {
      "name": "helloWorldLamports",
      "type": "u64",
      "value": "1"
    },
    {
      "name": "ledgerSeed",
      "type": "bytes",
      "value": "[108, 101, 100, 103, 101, 114]"
    },
    {
      "name": "maxCount",
      "type": "u64",
      "value": "10"
    },
    {
      "name": "workflowSeed",
      "type": "bytes",
      "value": "[119, 111, 114, 107, 102, 108, 111, 119]"
    }
  ]
};
