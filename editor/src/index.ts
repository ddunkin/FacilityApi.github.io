/// <reference path="../node_modules/monaco-editor/monaco" />
import * as _ from 'lodash';

interface IFile {
	name?: string;
	text: string;
}

export default function() {
	// get various HTML elements
	const fileList = document.getElementsByClassName('file-list')[0] as HTMLSelectElement;
	const generatorPicker = document.getElementsByClassName('generator-picker')[0] as HTMLSelectElement;
	const outputHeader = document.getElementsByClassName('right-top-container')[0];

	// register FSD language
	monaco.languages.register({
		id: 'fsd',
		extensions: [ '.fsd' ],
		aliases: [ 'fsd' ]
	});
	monaco.languages.setMonarchTokensProvider('fsd', {
		defaultToken: 'invalid',
		tokenPostfix: '',
		tokenizer: {
			root: [
				{ include: '@whitespace' },
				{ include: '@attribute' },
				[/service\b/, 'keyword'],
				[/[a-zA-Z][a-zA-Z0-9]*/, 'type.identifier'],
				[/{/, 'delimiter.curly', '@service'],
				[/^(?=#)/, 'markdown', '@markdown']
			],

			service: [
				{ include: '@whitespace' },
				{ include: '@attribute' },
				[/(method|data|errors|enum)\b/, 'keyword'],
				[/:/, 'delimiter' ],
				[/[a-zA-Z][a-zA-Z0-9]*/, 'type.identifier'],
				[/{/, 'delimiter.curly', '@member'],
				[/}/, 'delimiter.curly', '@pop']
			],

			member: [
				{ include: '@whitespace' },
				{ include: '@attribute' },
				[/,/, 'delimiter' ],
				[/[a-zA-Z][a-zA-Z0-9]*/, ''],
				[/:/, 'delimiter', '@typeName'],
				[/}/, 'delimiter.curly', '@pop']
			],

			typeName: [
				{ include: '@whitespace' },
				[/[a-zA-Z][a-zA-Z0-9]*/, { cases: { 'string|boolean|double|int32|int64|bytes|object|error|result|map': 'keyword', '@default': 'type.identifier' } }],
				[/[\[\]<>]/, '@brackets'],
				[/;/, 'delimiter', '@pop' ]
			],

			whitespace: [
					[/[ \t\r\n]+/, 'white'],
					[/\/\/.*$/, 'comment']
			],

			attribute: [
				[/\[/, 'delimiter', '@attrName']
			],

			attrName: [
				{ include: '@whitespace' },
				[/[a-zA-Z0-9\.\+\_\-]+/, 'annotation'],
				[/[\(\),]/, 'delimiter'],
				[/:/, 'delimiter', '@attrValue'],
				[/\]/, 'delimiter', '@pop']
			],

			attrValue: [
				{ include: '@whitespace' },
				[/[a-zA-Z0-9\.\+\_\-]+/, 'string'],
				[/"([^"\\]|\\.)*$/, 'string.invalid' ],
				[/"/, { token: 'string.quote', bracket: '@open', next: '@string' } ],
				[/[,\)]/, 'delimiter', '@pop']
			],

			string: [
				[/[^\\"]+/, 'string'],
				[/\\(?:[bfnrt\\"']|u[0-9A-Fa-f]{4})/, 'string.escape'],
				[/\\./, 'string.escape.invalid'],
				[/"/, { token: 'string.quote', bracket: '@close', next: '@pop' } ]
			],

			markdown: [
				[/^\s*##+.*/, 'strong'],
				[/^\s*#.*/, 'strong type.identifier'],
				[/^\s*([\*\-+:]|\d\.)/, 'string.list'],
				[/^\s*>+/, 'string.quote' ],
				[/\b__([^\\_]|_(?!_))+__\b/, 'strong'],
				[/\*\*([^\\*]|\*(?!\*))+\*\*/, 'strong'],
				[/\b_[^_]+_\b/, 'emphasis'],
				[/\*[^\\*]+\*/, 'emphasis'],
				[/(!?\[)((?:[^\]\\])+)(\]\([^\)]+\))/, ['string.link', '', 'string.link' ]],
				[/(!?\[)((?:[^\]\\])+)(\])/, 'string.link'],
				[/[^*_`([!]+/, '' ],
				[/[\*_`([!]/, '' ]
			]
		}
	});

	// create Monaco editors
	const leftMonacoOptions = {
		value: localStorage['fsdText'] || '',
		theme: 'vs-dark',
		language: 'fsd'
	};
	const leftMonaco = monaco.editor.create(document.getElementsByClassName('left-bottom-container')[0] as HTMLElement, leftMonacoOptions);
	const rightMonacoOptions = {
		readOnly: true,
		theme: 'vs-dark',
		wrappingColumn: -1
	};
	const rightMonaco = monaco.editor.create(document.getElementsByClassName('right-bottom-container')[0] as HTMLElement, rightMonacoOptions);
	window.onresize = function() {
		leftMonaco.layout();
		rightMonaco.layout();
	}

	// create function for setting output
	const lastFileName: { [generator: string]: string } = {};
	const setOutputFile = function(file: IFile) {
		const language = file && file.name && _.find(monaco.languages.getLanguages(), function (lang) {
			return _.find(lang.extensions, function (ext) {
				return file.name.endsWith(ext);
			});
		});
		const languageId = language && language.id;

		// word wrap some languages
		const wrappingColumn = languageId === 'markdown' ? 0 : -1;

		// update output editor
		rightMonaco.getModel().setValue('');
		monaco.editor.setModelLanguage(rightMonaco.getModel(), language && language.id);
		rightMonacoOptions.wrappingColumn = wrappingColumn;
		rightMonaco.updateOptions(rightMonacoOptions);
		rightMonaco.getModel().setValue(file && file.text || '');

		// update file name
		outputHeader.removeChild(outputHeader.firstChild);
		outputHeader.appendChild(document.createTextNode(file && file.name || '\u00a0'));

		// remember last file name to maintain selection
		if (file && file.name) {
			lastFileName[generatorPicker.value] = file.name;
		}
	};

	// set output as selection changes
	const setOutputToSelection = function() {
		const option = fileList.options[fileList.selectedIndex];
		setOutputFile(option && (option as any)['data-file']);
	};
	fileList.onchange = setOutputToSelection;

	// create function that generates output
	let generating = false;
	const generate = function() {
		if (generating) {
			generateSoon();
		} else {
			generating = true;
			const request: RequestInit = {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					generator: {
						name: generatorPicker.value
					},
					definition: {
						name: 'api.fsd',
						text: leftMonaco.getModel().getValue()
					}
				}),
				cache: 'no-cache'
			};
			const generateUrl = _.startsWith(window.location.href, 'http://local') ? 'http://localhost:45054/generate' : 'https://fsdgen.calexanderdev.com/generate';
			fetch(generateUrl, request)
				.then(function(response) {
					if (response.status === 200) {
						return response.json();
					} else {
						throw TypeError(response.status + ' ' + response.statusText);
					}
				})
				.then(function(json) {
					while (fileList.firstChild) {
						fileList.removeChild(fileList.firstChild);
					}
					if (json.output && json.output.length) {
						json.output.sort(function(a: IFile, b: IFile) {
							const aParts = a.name.split('/');
							const bParts = b.name.split('/');
							for (let index = 0; ; index++) {
								if (index === aParts.length) {
									return index === bParts.length ? 0 : -1;
								} else if (index === bParts.length) {
									return 1;
								} else {
									const aIsFile = index + 1 === aParts.length;
									const bIsFile = index + 1 === bParts.length;
									if (aIsFile === bIsFile) {
										if (aParts[index] < bParts[index]) {
											return -1;
										} else if (aParts[index] > bParts[index]) {
											return 1;
										}
									} else if (aIsFile) {
										return -1;
									} else {
										return 1;
									}
								}
							}
						});
						let selected = false;
						let optgroup: HTMLOptGroupElement = null;
						json.output.forEach(function(file: IFile) {
							const path = file.name.split('/');
							const name = path.pop();

							if (path.length) {
								const groupLabel = path.join('/') + '/';
								if (!optgroup || optgroup.label !== groupLabel) {
									optgroup = document.createElement("optgroup");
									optgroup.label = groupLabel;
									fileList.appendChild(optgroup);
								}
							}

							const option = document.createElement("option");
							option.label = name;
							if (!selected && lastFileName[generatorPicker.value] === name) {
								option.selected = true;
								selected = true;
							}
							(option as any)['data-file'] = file;
							if (optgroup) {
								optgroup.appendChild(option);
							} else {
								fileList.appendChild(option);
							}
						});
						if (!selected) {
							fileList.selectedIndex = 0;
						}
						setOutputToSelection();
					} else if (json.parseError) {
						setOutputFile({
							text: '(' + json.parseError.line + ',' + json.parseError.column + '): ' + json.parseError.message
						});
					} else {
						setOutputFile(undefined);
					}
					generating = false;
				})
				.catch(function(error) {
					setOutputFile({
						text: 'Error: ' + error.message
					});
					rightMonaco.getModel().setValue('Error: ' + error.message);
					generating = false;
				});
		}
	}
	generatorPicker.onchange = generate;

	// create function that generates output soon
	let generateTimeout: number;
	const generateSoon = function() {
		window.clearTimeout(generateTimeout);
		generateTimeout = window.setTimeout(generate, 500);
	}
	leftMonaco.getModel().onDidChangeContent(function() {
		localStorage['fsdText'] = leftMonaco.getModel().getValue();
		generateSoon();
	});

	// start with example
	if (!leftMonaco.getModel().getValue()) {
		leftMonaco.getModel().setValue(`
/// Example service for widgets.
[http(url: "http://local.example.com/v1")]
[csharp(namespace: Facility.ExampleApi)]
service ExampleApi
{
		/// Gets widgets.
		[http(method: GET, path: "/widgets")]
		method getWidgets
		{
				/// The query.
				[http(from: query, name: "q")]
				query: string;

				/// The limit of returned results.
				limit: int32;

				/// The sort field.
				sort: WidgetField;

				/// True to sort descending.
				desc: boolean;

				/// The maximum weight.
				[obsolete]
				maxWeight: double;
		}:
		{
				/// The widgets.
				widgets: Widget[];

				/// The total number of widgets.
				total: int64;

				/// The total weight.
				[obsolete]
				totalWeight: double;

				/// The pending job.
				[http(from: body, code: 202)]
				job: WidgetJob;
		}

		/// Creates a new widget.
		[http(method: POST, path: "/widgets/", code: 201)]
		method createWidget
		{
				/// The widget to create.
				[http(from: body)]
				widget: Widget;
		}:
		{
				/// The created widget.
				[http(from: body)]
				widget: Widget;
		}

		/// Gets the specified widget.
		[http(method: GET, path: "/widgets/{id}")]
		method getWidget
		{
				/// The widget ID.
				id: string;

				[http(from: header, name: "If-None-Match")]
				ifNoneMatch: string;
		}:
		{
				/// The requested widget.
				[http(from: body)]
				widget: Widget;

				[http(from: header)]
				eTag: string;

				[http(from: body, code: 304)]
				notModified: boolean;
		}

		/// Deletes the specified widget.
		[http(method: DELETE, path: "/widgets/{id}", code: 204)]
		method deleteWidget
		{
				/// The widget ID.
				id: string;
		}:
		{
		}

		/// Edits widget.
		[http(method: POST, path: "/widgets/{id}")]
		method editWidget
		{
				/// The widget ID.
				id: string;

				/// The operations.
				ops: object[];

				/// The new weight.
				[obsolete]
				weight: double;
		}:
		{
				/// The edited widget.
				[http(from: body, code: 200)]
				widget: Widget;

				/// The pending job.
				[http(from: body, code: 202)]
				job: WidgetJob;
		}

		/// Gets the specified widgets.
		[http(method: POST, path: "/widgets/get")]
		method getWidgetBatch
		{
				/// The IDs of the widgets to return.
				ids: string[];
		}:
		{
				/// The widget results.
				results: result<Widget>[];
		}

		/// Gets the widget weight.
		[obsolete]
		[http(method: GET, path: "/widgets/{id}/weight")]
		method getWidgetWeight
		{
				/// The widget ID.
				id: string;
		}:
		{
				/// The widget weight.
				value: double;
		}

		/// Gets a widget preference.
		[http(method: GET, path: "/prefs/{key}")]
		method getPreference
		{
				/// The preference key.
				key: string;
		}:
		{
				/// The preference value.
				[http(from: body)]
				value: Preference;
		}

		/// Sets a widget preference.
		[http(method: PUT, path: "/prefs/{key}")]
		method setPreference
		{
				/// The preference key.
				key: string;

				/// The preference value.
				[http(from: body)]
				value: Preference;
		}:
		{
				/// The preference value.
				[http(from: body)]
				value: Preference;
		}

		/// Demonstrates the default HTTP behavior.
		method notRestful
		{
		}:
		{
		}

		method kitchen
		{
				sink: KitchenSink;
		}:
		{
		}

		/// Custom errors.
		errors ExampleApiErrors
		{
				/// The user is not an administrator.
				[http(code: 403)]
				NotAdmin,
		}

		/// A widget.
		data Widget
		{
				/// A unique identifier for the widget.
				id: string;

				/// The name of the widget.
				name: string;

				/// The weight of the widget.
				[obsolete]
				weight: double;
		}

		/// A widget job.
		data WidgetJob
		{
				/// A unique identifier for the widget job.
				id: string;
		}

		/// A preference.
		data Preference
		{
				[csharp(name: "IsBoolean")]
				boolean: boolean;

				booleans: boolean[];

				double: double;

				doubles: double[];

				integer: int32;

				integers: int32[];

				string: string;

				strings: string[];

				bytes: bytes;

				byteses: bytes[];

				widgetField: WidgetField;

				widgetFields: WidgetField[];

				widget: Widget;

				widgets: Widget[];

				result: result<Widget>;

				results: result<Widget>[];

				bigInteger: int64;

				bigIntegers: int64[];

				error: error;

				errors: error[];

				object: object;

				objects: object[];

				namedStrings: map<string>;

				namedWidgets: map<Widget>;
		}

		/// Identifies a widget field.
		enum WidgetField
		{
				/// The 'id' field.
				id,

				/// The 'name' field.
				name,

				/// The 'weight' field.
				[obsolete]
				weight,
		}

		/// An obsolete DTO.
		[obsolete]
		data ObsoleteData
		{
				unused: boolean;
		}

		/// An obsolete enum.
		[obsolete]
		enum ObsoleteEnum
		{
				unused,
		}

		data KitchenSink
		{
				[obsolete, proto(id: 1)]
				oldField: string;
		}
}

# ExampleApi

Additional service remarks.

## Heading

Use a primary heading to indicate the member name.

# getWidgets

Additional method remarks.

# Widget

Additional DTO remarks.

## Heading

Only top-level headings need to match a member name.

# WidgetField

Additional enum remarks.
`);
	}

	leftMonaco.focus();
	generate();
}
