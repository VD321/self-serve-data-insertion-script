import json
import pandas as pd
import sys


def load_issue_json(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        return json.load(file)


def load_translation_csv(file_path):
    return pd.read_csv(file_path)


def find_translations(text, translations_df):
    translations = []

    # Filter the DataFrame for the current text
    translation_row = translations_df[translations_df['original_text'] == text]
    # print('checking for text:', text)
    if not translation_row.empty:
        for lang in ['hindi', 'kannada', 'tamil', 'telugu', 'malayalam']:
            # print('found translation for:', lang)
            translations.append({
                "language": lang.upper(),
                "translation": translation_row.iloc[0][lang]
            })
    return translations


def update_translations(node, translations_df):
    # current node is message node
    if 'messageTranslations' in node:
        if len(node['messageTranslations']) == 0:
            print('updating translations for message:', node['message'])
            node['messageTranslations'] = find_translations(
                node['message'], translations_df)

        if 'options' in node:
            for option in node['options']:
                update_translations(option, translations_df)

    # current node is option node
    if 'option' in node:
        if len(node['translations']) == 0:
            print('updating translations for option:', node['option'])
            node['translations'] = find_translations(
                node['option'], translations_df)

        if 'messages' in node:
            for message in node['messages']:
                update_translations(message, translations_df)

    # current node is category node
    if 'translations' in node and 'category' in node:
        print('updating translations for category:', node['category'])
        node['translations'] = find_translations(
            node['category'], translations_df)

        if 'messages' in node:
            for message in node['messages']:
                update_translations(message, translations_df)


def main(issue_file, translation_file):
    # Load the issue JSON and translations CSV
    issue_data = load_issue_json(issue_file)
    translations_df = load_translation_csv(translation_file)

    # Update translations in the issue data
    update_translations(issue_data, translations_df)

    # Save the updated JSON back to a file
    with open(f'updated_{issue_file.replace('.json', '')}.json', 'w', encoding='utf-8') as outfile:
        json.dump(issue_data, outfile, ensure_ascii=False, indent=4)


# Take file paths as arguments from the command line
if len(sys.argv) != 3:
    print("Usage: python map_translate.py <issue_file_path> <translation_file_path>")
    sys.exit(1)

issue_file_path = sys.argv[1]
translation_file_path = sys.argv[2]

# Run the program
main(issue_file_path, translation_file_path)
